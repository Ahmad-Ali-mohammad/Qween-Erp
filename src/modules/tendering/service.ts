import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { awardOpportunityWithTransaction } from '../crm/opportunities.service';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

function normalizeAmount(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Errors.validation(`${fieldName} غير صالح`);
  }
  return Math.round(amount * 100) / 100;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

async function generateTenderNumber(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.tender.findFirst({
    where: {
      number: {
        startsWith: `TND-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest('TND', latest?.number, year);
}

function normalizeEstimateLines(lines: any[] = []) {
  return lines
    .map((line, index) => {
      const description = String(line?.description ?? '').trim();
      if (!description) return null;
      const quantity = normalizeAmount(line?.quantity ?? 0, 'الكمية') ?? 0;
      const unitCost = normalizeAmount(line?.unitCost ?? 0, 'تكلفة الوحدة') ?? 0;
      const totalCost = Math.round(quantity * unitCost * 100) / 100;
      return {
        lineNumber: index + 1,
        category: normalizeText(line?.category),
        description,
        costType: normalizeText(line?.costType),
        quantity,
        unitCost,
        totalCost
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
}

function normalizeCompetitors(rows: any[] = []) {
  return rows
    .map((row) => {
      const name = String(row?.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        offeredValue: normalizeAmount(row?.offeredValue, 'قيمة عرض المنافس', true),
        rank: row?.rank ? Number(row.rank) : null,
        notes: normalizeText(row?.notes)
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function sumLineTotals(lines: Array<{ totalCost: number }>) {
  return Math.round(lines.reduce((sum, line) => sum + Number(line.totalCost ?? 0), 0) * 100) / 100;
}

async function resolveTenderContext(tx: any, data: any, current: any = null) {
  const opportunityId = Number(data.opportunityId ?? current?.opportunityId ?? 0) || null;
  const opportunity = opportunityId ? await tx.opportunity.findUnique({ where: { id: opportunityId } }) : null;
  if (opportunityId && !opportunity) throw Errors.notFound('الفرصة التجارية غير موجودة');

  const customerId = Number(data.customerId ?? opportunity?.customerId ?? current?.customerId ?? 0) || null;
  const customer = customerId
    ? await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, code: true, nameAr: true, branchId: true }
      })
    : null;
  if (customerId && !customer) throw Errors.notFound('العميل غير موجود');

  if (opportunity?.customerId && customerId && Number(opportunity.customerId) !== customerId) {
    throw Errors.business('العميل لا يطابق الفرصة التجارية المرتبطة');
  }

  const branchId = Number(data.branchId ?? current?.branchId ?? customer?.branchId ?? 0) || null;
  return { opportunity, opportunityId, customer, customerId, branchId };
}

async function fetchTender(tx: any, id: number) {
  const tender = await tx.tender.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      customer: { select: { id: true, code: true, nameAr: true } },
      opportunity: { select: { id: true, title: true, stage: true, status: true, value: true } },
      estimateLines: { orderBy: { lineNumber: 'asc' } },
      competitors: { orderBy: [{ rank: 'asc' }, { id: 'asc' }] }
    }
  });
  if (!tender) throw Errors.notFound('العطاء غير موجود');

  let contract = null;
  let project = null;
  if (tender.contractId) {
    contract = await tx.contract.findUnique({
      where: { id: tender.contractId },
      select: { id: true, number: true, title: true, value: true }
    });
  }
  if (tender.projectId) {
    project = await tx.project.findUnique({
      where: { id: tender.projectId },
      select: { id: true, code: true, nameAr: true, budget: true }
    });
  }

  return {
    ...tender,
    contract,
    project
  };
}

export async function listTenders(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.opportunityId) where.opportunityId = Number(query.opportunityId);
  if (query.status) where.status = String(query.status);
  if (query.result) where.result = String(query.result);
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { issuerName: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.tender.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        customer: { select: { id: true, code: true, nameAr: true } },
        opportunity: { select: { id: true, title: true, stage: true, status: true } },
        estimateLines: { orderBy: { lineNumber: 'asc' } },
        competitors: { orderBy: [{ rank: 'asc' }, { id: 'asc' }] }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.tender.count({ where })
  ]);

  return {
    rows,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function getTender(id: number) {
  return prisma.$transaction((tx) => fetchTender(tx, id));
}

export async function createTender(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const { opportunityId, customerId, branchId } = await resolveTenderContext(tx, data);
    const estimateLines = normalizeEstimateLines(data.estimateLines ?? []);
    const competitors = normalizeCompetitors(data.competitors ?? []);
    const estimatedValue = sumLineTotals(estimateLines);
    const offeredValue = normalizeAmount(data.offeredValue ?? estimatedValue, 'قيمة العرض') ?? estimatedValue;
    const guaranteeAmount = normalizeAmount(data.guaranteeAmount, 'قيمة الضمان', true) ?? 0;

    const tender = await tx.tender.create({
      data: {
        number: data.number ?? (await generateTenderNumber(tx)),
        title: String(data.title ?? '').trim(),
        branchId,
        customerId,
        opportunityId,
        issuerName: normalizeText(data.issuerName),
        bidDueDate: data.bidDueDate ? parseDateOrThrow(data.bidDueDate, 'bidDueDate') : null,
        estimatedValue,
        offeredValue,
        guaranteeAmount,
        notes: normalizeText(data.notes),
        createdById: userId,
        updatedById: userId,
        estimateLines: {
          create: estimateLines
        },
        competitors: {
          create: competitors
        }
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'tendering.tender.created',
      aggregateType: 'Tender',
      aggregateId: String(tender.id),
      actorId: userId,
      branchId,
      correlationId: `tender:${tender.id}:created`,
      payload: {
        tenderId: tender.id,
        number: tender.number,
        opportunityId,
        customerId,
        estimatedValue,
        offeredValue
      }
    });

    return fetchTender(tx, tender.id);
  });
}

export async function updateTender(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tender.findUnique({
      where: { id },
      include: {
        estimateLines: true,
        competitors: true
      }
    });
    if (!current) throw Errors.notFound('العطاء غير موجود');
    if (current.result) throw Errors.business('لا يمكن تعديل عطاء بعد تسجيل نتيجته');

    const { opportunityId, customerId, branchId } = await resolveTenderContext(tx, data, current);
    const estimateLines = normalizeEstimateLines(data.estimateLines ?? current.estimateLines);
    const competitors = normalizeCompetitors(data.competitors ?? current.competitors);
    const estimatedValue = sumLineTotals(estimateLines);
    const offeredValue = normalizeAmount(data.offeredValue ?? current.offeredValue ?? estimatedValue, 'قيمة العرض') ?? estimatedValue;
    const guaranteeAmount = normalizeAmount(data.guaranteeAmount ?? current.guaranteeAmount, 'قيمة الضمان', true) ?? 0;

    await tx.tenderEstimateLine.deleteMany({ where: { tenderId: id } });
    await tx.tenderCompetitor.deleteMany({ where: { tenderId: id } });

    await tx.tender.update({
      where: { id },
      data: {
        number: data.number ?? current.number,
        title: String(data.title ?? current.title).trim(),
        branchId,
        customerId,
        opportunityId,
        issuerName: normalizeText(data.issuerName ?? current.issuerName),
        bidDueDate:
          data.bidDueDate !== undefined
            ? data.bidDueDate
              ? parseDateOrThrow(data.bidDueDate, 'bidDueDate')
              : null
            : current.bidDueDate,
        estimatedValue,
        offeredValue,
        guaranteeAmount,
        notes: normalizeText(data.notes ?? current.notes),
        updatedById: userId,
        status: current.status === 'SUBMITTED' ? 'DRAFT' : current.status,
        approvalStatus: current.status === 'SUBMITTED' ? 'DRAFT' : current.approvalStatus,
        submittedAt: current.status === 'SUBMITTED' ? null : current.submittedAt,
        estimateLines: {
          create: estimateLines
        },
        competitors: {
          create: competitors
        }
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'tendering.tender.updated',
      aggregateType: 'Tender',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `tender:${id}:updated`,
      payload: {
        tenderId: id,
        opportunityId,
        customerId,
        estimatedValue,
        offeredValue
      }
    });

    return fetchTender(tx, id);
  });
}

export async function submitTender(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tender.findUnique({
      where: { id },
      include: { estimateLines: true }
    });
    if (!current) throw Errors.notFound('العطاء غير موجود');
    if (current.result) throw Errors.business('تم تسجيل نتيجة هذا العطاء بالفعل');
    if (!current.estimateLines.length) throw Errors.business('لا يمكن إرسال عطاء بدون بنود تقدير');
    if (Number(current.offeredValue ?? 0) <= 0) throw Errors.business('قيمة العرض يجب أن تكون أكبر من صفر قبل الإرسال');

    const updated = await tx.tender.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'tendering.tender.submitted',
      aggregateType: 'Tender',
      aggregateId: String(updated.id),
      actorId: userId,
      branchId: updated.branchId,
      correlationId: `tender:${updated.id}:submitted`,
      payload: {
        tenderId: updated.id,
        number: updated.number,
        offeredValue: updated.offeredValue,
        bidDueDate: updated.bidDueDate
      }
    });

    return fetchTender(tx, id);
  });
}

export async function recordTenderResult(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tender.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('العطاء غير موجود');
    if (current.result) throw Errors.business('تم تسجيل نتيجة هذا العطاء سابقًا');

    const result = String(data.result ?? '').toUpperCase();
    if (!['WON', 'LOST', 'CANCELLED'].includes(result)) {
      throw Errors.validation('نتيجة العطاء غير صالحة');
    }

    let contractId = current.contractId;
    let projectId = current.projectId;
    let awardPayload: any = null;

    if (result === 'WON' && current.opportunityId) {
      const awarded = await awardOpportunityWithTransaction(
        tx,
        current.opportunityId,
        {
          branchId: data.branchId ?? current.branchId,
          startDate: data.startDate ?? new Date().toISOString(),
          endDate: data.endDate,
          contractNumber: data.contractNumber,
          contractTitle: data.contractTitle ?? current.title,
          contractType: data.contractType ?? 'CLIENT',
          contractValue: data.contractValue ?? current.offeredValue ?? current.estimatedValue,
          terms: data.terms ?? current.notes,
          createProject: data.createProject !== false,
          projectCode: data.projectCode,
          projectNameAr: data.projectNameAr ?? current.title,
          projectNameEn: data.projectNameEn,
          projectType: data.projectType ?? 'EXECUTION',
          managerId: data.managerId,
          projectDescription: data.projectDescription ?? current.notes
        },
        userId
      );

      contractId = awarded.contract.id;
      projectId = awarded.project?.id ?? null;
      awardPayload = {
        contractId,
        projectId
      };
    }

    await tx.tender.update({
      where: { id },
      data: {
        status: result,
        result,
        resultReason: normalizeText(data.resultReason),
        resultRecordedAt: new Date(),
        awardedAt: result === 'WON' ? new Date() : null,
        approvalStatus: result === 'WON' ? 'APPROVED' : 'REJECTED',
        contractId,
        projectId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'tendering.tender.resulted',
      aggregateType: 'Tender',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `tender:${id}:resulted`,
      payload: {
        tenderId: id,
        number: current.number,
        result,
        contractId,
        projectId,
        opportunityId: current.opportunityId,
        awardPayload
      }
    });

    return fetchTender(tx, id);
  });
}
