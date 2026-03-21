import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeStatus(value: unknown, fallback: string): string {
  const text = normalizeText(value);
  return String(text ?? fallback).toUpperCase();
}

function normalizeAmount(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw Errors.validation(`${fieldName} غير صالح`);
  return Math.round(parsed * 100) / 100;
}

function normalizePositiveInt(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed <= 0) throw Errors.validation(`${fieldName} غير صالح`);
  return parsed;
}

function buildPage(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

async function generateContractNumber(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.contract.findFirst({
    where: {
      number: {
        startsWith: `CTR-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest('CTR', latest?.number, year);
}

async function ensureBranch(tx: any, branchId: number | null) {
  if (!branchId) return null;
  const branch = await tx.branch.findUnique({
    where: { id: branchId },
    select: { id: true, code: true, nameAr: true }
  });
  if (!branch) throw Errors.notFound('الفرع غير موجود');
  return branch;
}

async function ensureParty(tx: any, partyType: string, partyId: number | null) {
  if (!partyId) return null;
  const normalizedType = String(partyType).toUpperCase();
  if (normalizedType === 'CUSTOMER') {
    const customer = await tx.customer.findUnique({
      where: { id: partyId },
      select: { id: true, code: true, nameAr: true }
    });
    if (!customer) throw Errors.notFound('العميل غير موجود');
    return { type: normalizedType, ...customer };
  }
  if (normalizedType === 'SUPPLIER') {
    const supplier = await tx.supplier.findUnique({
      where: { id: partyId },
      select: { id: true, code: true, nameAr: true }
    });
    if (!supplier) throw Errors.notFound('المورد غير موجود');
    return { type: normalizedType, ...supplier };
  }
  return { type: normalizedType, id: partyId, code: null, nameAr: null };
}

async function fetchPartyMaps(tx: any, rows: any[]) {
  const customerIds = Array.from(
    new Set(
      rows
        .filter((row) => String(row.partyType).toUpperCase() === 'CUSTOMER' && Number.isInteger(row.partyId))
        .map((row) => Number(row.partyId))
    )
  );
  const supplierIds = Array.from(
    new Set(
      rows
        .filter((row) => String(row.partyType).toUpperCase() === 'SUPPLIER' && Number.isInteger(row.partyId))
        .map((row) => Number(row.partyId))
    )
  );

  const [customers, suppliers] = await Promise.all([
    customerIds.length
      ? tx.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, code: true, nameAr: true } })
      : Promise.resolve([]),
    supplierIds.length
      ? tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, code: true, nameAr: true } })
      : Promise.resolve([])
  ]);

  return {
    customers: new Map<number, any>(customers.map((row: any) => [row.id, row])),
    suppliers: new Map<number, any>(suppliers.map((row: any) => [row.id, row]))
  };
}

async function enrichContracts(tx: any, rows: any[]) {
  const [partyMaps, projectCounts] = await Promise.all([
    fetchPartyMaps(tx, rows),
    rows.length
      ? tx.project.groupBy({
          by: ['contractId'],
          where: { contractId: { in: rows.map((row) => row.id) } },
          _count: { _all: true }
        })
      : Promise.resolve([])
  ]);

  const projectCountMap = new Map<number, number>(
    projectCounts.filter((row: any) => row.contractId != null).map((row: any) => [Number(row.contractId), Number(row._count?._all ?? 0)])
  );

  return rows.map((row) => {
    const partyType = String(row.partyType ?? '').toUpperCase();
    const party =
      partyType === 'CUSTOMER'
        ? partyMaps.customers.get(Number(row.partyId)) ?? null
        : partyType === 'SUPPLIER'
          ? partyMaps.suppliers.get(Number(row.partyId)) ?? null
          : null;

    return {
      ...row,
      partyLabel: party ? [party.code, party.nameAr].filter(Boolean).join(' - ') : null,
      party,
      projectCount: projectCountMap.get(Number(row.id)) ?? 0
    };
  });
}

async function enrichMilestones(tx: any, rows: any[]) {
  const contractIds = Array.from(new Set(rows.map((row) => Number(row.contractId)).filter((value) => value > 0)));
  const contracts =
    contractIds.length > 0
      ? await tx.contract.findMany({
          where: { id: { in: contractIds } },
          include: {
            branch: {
              select: { id: true, code: true, nameAr: true }
            }
          }
        })
      : [];
  const contractRows = await enrichContracts(tx, contracts);
  const contractMap = new Map<number, any>(contractRows.map((row: any) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    contract: contractMap.get(Number(row.contractId)) ?? null
  }));
}

async function fetchContract(tx: any, id: number) {
  const contract = await tx.contract.findUnique({
    where: { id },
    include: {
      branch: {
        select: { id: true, code: true, nameAr: true }
      }
    }
  });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  const [enrichedContract, milestones] = await Promise.all([
    enrichContracts(tx, [contract]),
    tx.contractMilestone.findMany({
      where: { contractId: id },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
    })
  ]);
  return {
    ...enrichedContract[0],
    milestones: await enrichMilestones(tx, milestones)
  };
}

async function fetchMilestone(tx: any, id: number) {
  const milestone = await tx.contractMilestone.findUnique({ where: { id } });
  if (!milestone) throw Errors.notFound('المرحلة التعاقدية غير موجودة');
  return (await enrichMilestones(tx, [milestone]))[0];
}

export async function listContracts(query: any) {
  const page = buildPage(query);
  const where: any = {};

  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status).toUpperCase();
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus).toUpperCase();
  if (query.partyType) where.partyType = String(query.partyType).toUpperCase();
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      skip: page.skip,
      take: page.limit,
      include: {
        branch: {
          select: { id: true, code: true, nameAr: true }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.contract.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichContracts(tx, rows)),
    meta: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.max(1, Math.ceil(total / page.limit))
    }
  };
}

export async function getContract(id: number) {
  return prisma.$transaction((tx) => fetchContract(tx, id));
}

export async function createContract(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const branchId = normalizePositiveInt(data.branchId, 'branchId', true);
    const partyType = normalizeStatus(data.partyType, 'CUSTOMER');
    const partyId = normalizePositiveInt(data.partyId, 'partyId', true);

    await Promise.all([ensureBranch(tx, branchId), ensureParty(tx, partyType, partyId)]);

    const row = await tx.contract.create({
      data: {
        number: normalizeText(data.number) ?? (await generateContractNumber(tx)),
        branchId,
        title: String(data.title).trim(),
        partyType,
        partyId,
        type: normalizeText(data.type),
        startDate: parseDateOrThrow(data.startDate, 'startDate'),
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null,
        value: normalizeAmount(data.value, 'value') ?? 0,
        status: normalizeStatus(data.status, 'DRAFT'),
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        terms: normalizeText(data.terms),
        attachmentsCount: Number(data.attachmentsCount ?? 0)
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.contract.created',
      aggregateType: 'Contract',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: {
        number: row.number,
        title: row.title,
        partyType: row.partyType,
        partyId: row.partyId ?? null,
        value: Number(row.value ?? 0)
      }
    });

    return fetchContract(tx, row.id);
  });
}

export async function updateContract(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العقد غير موجود');

    const branchId = Object.prototype.hasOwnProperty.call(data, 'branchId')
      ? normalizePositiveInt(data.branchId, 'branchId', true)
      : current.branchId;
    const partyType = Object.prototype.hasOwnProperty.call(data, 'partyType')
      ? normalizeStatus(data.partyType, current.partyType)
      : current.partyType;
    const partyId = Object.prototype.hasOwnProperty.call(data, 'partyId')
      ? normalizePositiveInt(data.partyId, 'partyId', true)
      : current.partyId;

    await Promise.all([ensureBranch(tx, branchId), ensureParty(tx, partyType, partyId)]);

    await tx.contract.update({
      where: { id },
      data: {
        number: Object.prototype.hasOwnProperty.call(data, 'number') ? normalizeText(data.number) ?? current.number : undefined,
        branchId,
        title: Object.prototype.hasOwnProperty.call(data, 'title') ? String(data.title).trim() : undefined,
        partyType,
        partyId,
        type: Object.prototype.hasOwnProperty.call(data, 'type') ? normalizeText(data.type) : undefined,
        startDate: Object.prototype.hasOwnProperty.call(data, 'startDate') ? parseDateOrThrow(data.startDate, 'startDate') : undefined,
        endDate: Object.prototype.hasOwnProperty.call(data, 'endDate')
          ? (data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null)
          : undefined,
        value: Object.prototype.hasOwnProperty.call(data, 'value') ? normalizeAmount(data.value, 'value') ?? 0 : undefined,
        status: Object.prototype.hasOwnProperty.call(data, 'status') ? normalizeStatus(data.status, current.status) : undefined,
        terms: Object.prototype.hasOwnProperty.call(data, 'terms') ? normalizeText(data.terms) : undefined,
        attachmentsCount: Object.prototype.hasOwnProperty.call(data, 'attachmentsCount')
          ? Number(data.attachmentsCount ?? 0)
          : undefined
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.contract.updated',
      aggregateType: 'Contract',
      aggregateId: String(id),
      actorId: userId,
      branchId: branchId ?? null,
      payload: {
        title: Object.prototype.hasOwnProperty.call(data, 'title') ? String(data.title).trim() : current.title,
        status: Object.prototype.hasOwnProperty.call(data, 'status') ? normalizeStatus(data.status, current.status) : current.status
      }
    });

    return fetchContract(tx, id);
  });
}

export async function deleteContract(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العقد غير موجود');

    const projectCount = await tx.project.count({ where: { contractId: id } });
    if (projectCount > 0) throw Errors.business('لا يمكن حذف عقد مرتبط بمشاريع');

    await tx.contractMilestone.deleteMany({ where: { contractId: id } });
    await tx.contract.delete({ where: { id } });
    return { deleted: true, id };
  });
}

export async function approveContract(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العقد غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('العقد ليس في حالة مسودة');

    await tx.contract.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalStatus: 'APPROVED'
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.contract.approved',
      aggregateType: 'Contract',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId ?? null,
      payload: { number: current.number, title: current.title }
    });

    return fetchContract(tx, id);
  });
}

export async function renewContract(id: number, months: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العقد غير موجود');
    if (!['APPROVED', 'RENEWED'].includes(String(current.status).toUpperCase())) {
      throw Errors.business('لا يمكن تجديد عقد غير معتمد');
    }

    const nextEnd = current.endDate ? new Date(current.endDate) : new Date();
    nextEnd.setUTCMonth(nextEnd.getUTCMonth() + months);

    await tx.contract.update({
      where: { id },
      data: {
        status: 'RENEWED',
        approvalStatus: 'APPROVED',
        endDate: nextEnd
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.contract.renewed',
      aggregateType: 'Contract',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId ?? null,
      payload: { number: current.number, title: current.title, months, endDate: nextEnd.toISOString() }
    });

    return fetchContract(tx, id);
  });
}

export async function terminateContract(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العقد غير موجود');
    if (String(current.status).toUpperCase() === 'TERMINATED') throw Errors.business('العقد منتهي بالفعل');

    await tx.contract.update({
      where: { id },
      data: {
        status: 'TERMINATED'
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.contract.terminated',
      aggregateType: 'Contract',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId ?? null,
      payload: { number: current.number, title: current.title }
    });

    return fetchContract(tx, id);
  });
}

export async function listContractMilestones(contractId: number, query: any) {
  const page = buildPage(query);
  const where: any = { contractId };
  if (query.status) where.status = String(query.status).toUpperCase();

  const [rows, total] = await Promise.all([
    prisma.contractMilestone.findMany({
      where,
      skip: page.skip,
      take: page.limit,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
    }),
    prisma.contractMilestone.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichMilestones(tx, rows)),
    meta: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.max(1, Math.ceil(total / page.limit))
    }
  };
}

export async function createContractMilestone(contractId: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw Errors.notFound('العقد غير موجود');
    if (String(contract.status).toUpperCase() === 'TERMINATED') throw Errors.business('لا يمكن إضافة مرحلة إلى عقد منتهي');

    const row = await tx.contractMilestone.create({
      data: {
        contractId,
        title: String(data.title).trim(),
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        amount: normalizeAmount(data.amount, 'amount') ?? 0,
        status: normalizeStatus(data.status, 'PENDING'),
        notes: normalizeText(data.notes)
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.milestone.created',
      aggregateType: 'ContractMilestone',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: contract.branchId ?? null,
      payload: { contractId, title: row.title, amount: Number(row.amount ?? 0) }
    });

    return fetchMilestone(tx, row.id);
  });
}

export async function updateContractMilestone(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contractMilestone.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('المرحلة التعاقدية غير موجودة');
    const contract = await tx.contract.findUnique({ where: { id: current.contractId } });
    if (!contract) throw Errors.notFound('العقد غير موجود');

    await tx.contractMilestone.update({
      where: { id },
      data: {
        title: Object.prototype.hasOwnProperty.call(data, 'title') ? String(data.title).trim() : undefined,
        dueDate: Object.prototype.hasOwnProperty.call(data, 'dueDate')
          ? (data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null)
          : undefined,
        amount: Object.prototype.hasOwnProperty.call(data, 'amount') ? normalizeAmount(data.amount, 'amount') ?? 0 : undefined,
        status: Object.prototype.hasOwnProperty.call(data, 'status') ? normalizeStatus(data.status, current.status) : undefined,
        notes: Object.prototype.hasOwnProperty.call(data, 'notes') ? normalizeText(data.notes) : undefined
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.milestone.updated',
      aggregateType: 'ContractMilestone',
      aggregateId: String(id),
      actorId: userId,
      branchId: contract.branchId ?? null,
      payload: {
        contractId: current.contractId,
        title: Object.prototype.hasOwnProperty.call(data, 'title') ? String(data.title).trim() : current.title
      }
    });

    return fetchMilestone(tx, id);
  });
}

export async function deleteContractMilestone(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contractMilestone.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('المرحلة التعاقدية غير موجودة');
    const contract = await tx.contract.findUnique({ where: { id: current.contractId } });

    await tx.contractMilestone.delete({ where: { id } });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.milestone.deleted',
      aggregateType: 'ContractMilestone',
      aggregateId: String(id),
      actorId: userId,
      branchId: contract?.branchId ?? null,
      payload: { contractId: current.contractId, title: current.title }
    });

    return { deleted: true, id };
  });
}

export async function completeContractMilestone(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.contractMilestone.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('المرحلة التعاقدية غير موجودة');
    if (String(current.status).toUpperCase() === 'COMPLETED') throw Errors.business('المرحلة مكتملة بالفعل');

    const contract = await tx.contract.findUnique({ where: { id: current.contractId } });
    if (!contract || !['APPROVED', 'RENEWED'].includes(String(contract.status).toUpperCase())) {
      throw Errors.business('لا يمكن إكمال مرحلة لعقد غير معتمد');
    }

    await tx.contractMilestone.update({
      where: { id },
      data: {
        status: 'COMPLETED'
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'contracts.milestone.completed',
      aggregateType: 'ContractMilestone',
      aggregateId: String(id),
      actorId: userId,
      branchId: contract.branchId ?? null,
      payload: { contractId: current.contractId, title: current.title }
    });

    return fetchMilestone(tx, id);
  });
}
