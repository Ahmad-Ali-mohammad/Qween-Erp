import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { reserveNextSequenceInDb } from '../numbering/service';

type PaginationResult<T> = {
  rows: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

async function ensureCustomerExists(customerId?: number | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw Errors.validation('العميل غير موجود');
}

async function ensureBranchExists(tx: Prisma.TransactionClient | typeof prisma, branchId?: number | null) {
  if (!branchId) return;
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
}

export async function listOpportunities(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.OpportunityWhereInput = {
    ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
    ...(query.stage ? { stage: String(query.stage) } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({ where, skip, take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
    prisma.opportunity.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getOpportunity(id: number) {
  const row = await prisma.opportunity.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('الفرصة غير موجودة');
  return row;
}

export async function createOpportunity(data: {
  title: string;
  customerId?: number;
  stage?: string;
  probability?: number;
  expectedCloseDate?: string;
  value?: number;
  ownerId?: number;
  notes?: string;
  status?: string;
}) {
  await ensureCustomerExists(data.customerId);
  return prisma.opportunity.create({
    data: {
      title: data.title,
      customerId: data.customerId ?? null,
      stage: data.stage ?? 'LEAD',
      probability: data.probability ?? 0,
      expectedCloseDate: data.expectedCloseDate ? parseDateOrThrow(data.expectedCloseDate, 'expectedCloseDate') : null,
      value: data.value ?? 0,
      ownerId: data.ownerId ?? null,
      notes: data.notes,
      status: data.status ?? 'OPEN'
    }
  });
}

export async function updateOpportunity(
  id: number,
  data: {
    title?: string;
    customerId?: number | null;
    stage?: string;
    probability?: number;
    expectedCloseDate?: string | null;
    value?: number;
    ownerId?: number | null;
    notes?: string;
    status?: string;
  }
) {
  const current = await prisma.opportunity.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('الفرصة غير موجودة');
  if (data.customerId !== undefined && data.customerId !== null) await ensureCustomerExists(data.customerId);

  return prisma.opportunity.update({
    where: { id },
    data: {
      ...('title' in data ? { title: data.title } : {}),
      ...('customerId' in data ? { customerId: data.customerId ?? null } : {}),
      ...('stage' in data ? { stage: data.stage } : {}),
      ...('probability' in data ? { probability: data.probability } : {}),
      ...('expectedCloseDate' in data
        ? { expectedCloseDate: data.expectedCloseDate ? parseDateOrThrow(data.expectedCloseDate, 'expectedCloseDate') : null }
        : {}),
      ...('value' in data ? { value: data.value } : {}),
      ...('ownerId' in data ? { ownerId: data.ownerId ?? null } : {}),
      ...('notes' in data ? { notes: data.notes } : {}),
      ...('status' in data ? { status: data.status } : {})
    }
  });
}

export async function deleteOpportunity(id: number) {
  const current = await prisma.opportunity.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('الفرصة غير موجودة');
  await prisma.opportunity.delete({ where: { id } });
  return { deleted: true, id };
}

export async function convertOpportunityToContract(
  opportunityId: number,
  data: {
    branchId?: number;
    title?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    value?: number;
    status?: string;
    terms?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) throw Errors.notFound('الفرصة غير موجودة');
    if (!opportunity.customerId) throw Errors.business('لا يمكن تحويل فرصة غير مرتبطة بعميل');

    await ensureBranchExists(tx, data.branchId);

    const existingContract = await tx.contract.findFirst({
      where: {
        partyType: 'CUSTOMER',
        partyId: opportunity.customerId,
        title: data.title ?? opportunity.title
      },
      orderBy: { id: 'desc' }
    });

    if (existingContract) {
      return {
        duplicate: true,
        opportunityId,
        contractId: existingContract.id,
        contractNumber: existingContract.number
      };
    }

    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'CTR',
      branchId: data.branchId ?? null,
      date: data.startDate ?? new Date()
    });

    const contract = await tx.contract.create({
      data: {
        number: sequence.number,
        branchId: data.branchId ?? null,
        title: data.title ?? opportunity.title,
        partyType: 'CUSTOMER',
        partyId: opportunity.customerId,
        type: data.type ?? 'SERVICE',
        startDate: data.startDate ? parseDateOrThrow(data.startDate) : new Date(),
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null,
        value: data.value ?? Number(opportunity.value ?? 0),
        status: data.status ?? 'APPROVED',
        terms: data.terms ?? opportunity.notes
      }
    });

    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: 'CONVERTED',
        status: 'WON'
      }
    });

    return {
      duplicate: false,
      opportunityId,
      contractId: contract.id,
      contractNumber: contract.number
    };
  });
}

export async function listContracts(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.ContractWhereInput = {
    ...(query.partyType ? { partyType: String(query.partyType) } : {}),
    ...(query.partyId ? { partyId: Number(query.partyId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.contract.findMany({ where, skip, take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
    prisma.contract.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getContract(id: number) {
  const row = await prisma.contract.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('العقد غير موجود');
  const projects = await prisma.project.findMany({ where: { contractId: id }, orderBy: { id: 'desc' } });
  return { ...row, projects };
}

export async function createContract(data: {
  number?: string;
  branchId?: number;
  title: string;
  partyType: string;
  partyId?: number;
  type?: string;
  startDate: string;
  endDate?: string;
  value?: number;
  status?: string;
  terms?: string;
}) {
  if (String(data.partyType).toUpperCase() === 'CUSTOMER') await ensureCustomerExists(data.partyId);

  return prisma.$transaction(async (tx) => {
    await ensureBranchExists(tx, data.branchId);
    const number =
      data.number ??
      (
        await reserveNextSequenceInDb(tx, {
          documentType: 'CTR',
          branchId: data.branchId ?? null,
          date: data.startDate
        })
      ).number;

    return tx.contract.create({
      data: {
        number,
        branchId: data.branchId ?? null,
        title: data.title,
        partyType: data.partyType,
        partyId: data.partyId ?? null,
        type: data.type,
        startDate: parseDateOrThrow(data.startDate),
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null,
        value: data.value ?? 0,
        status: data.status ?? 'DRAFT',
        terms: data.terms
      }
    });
  });
}

export async function updateContract(
  id: number,
  data: {
    branchId?: number | null;
    title?: string;
    partyType?: string;
    partyId?: number | null;
    type?: string;
    startDate?: string;
    endDate?: string | null;
    value?: number;
    status?: string;
    terms?: string;
  }
) {
  const current = await prisma.contract.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('العقد غير موجود');

  if (data.partyType && String(data.partyType).toUpperCase() === 'CUSTOMER' && data.partyId) {
    await ensureCustomerExists(data.partyId);
  }

  return prisma.$transaction(async (tx) => {
    await ensureBranchExists(tx, data.branchId);
    return tx.contract.update({
      where: { id },
      data: {
        ...('branchId' in data ? { branchId: data.branchId ?? null } : {}),
        ...('title' in data ? { title: data.title } : {}),
        ...('partyType' in data ? { partyType: data.partyType } : {}),
        ...('partyId' in data ? { partyId: data.partyId ?? null } : {}),
        ...('type' in data ? { type: data.type } : {}),
        ...('startDate' in data ? { startDate: parseDateOrThrow(data.startDate!, 'startDate') } : {}),
        ...('endDate' in data ? { endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null } : {}),
        ...('value' in data ? { value: data.value } : {}),
        ...('status' in data ? { status: data.status } : {}),
        ...('terms' in data ? { terms: data.terms } : {})
      }
    });
  });
}

export async function deleteContract(id: number) {
  const current = await prisma.contract.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('العقد غير موجود');
  const projectCount = await prisma.project.count({ where: { contractId: id } });
  if (projectCount > 0) throw Errors.business('لا يمكن حذف عقد مرتبط بمشروع');
  await prisma.contract.delete({ where: { id } });
  return { deleted: true, id };
}

export async function approveContract(id: number) {
  const current = await prisma.contract.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('العقد غير موجود');
  const status = String(current.status ?? '').toUpperCase();
  if (['TERMINATED', 'CLOSED'].includes(status)) {
    throw Errors.business('لا يمكن اعتماد عقد مغلق أو منتهي');
  }
  if (status === 'APPROVED') return current;
  return prisma.contract.update({
    where: { id },
    data: { status: 'APPROVED' }
  });
}

export async function listContractMilestones(contractId: number) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractMilestone.findMany({
    where: { contractId },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
  });
}

export async function createContractMilestone(
  contractId: number,
  data: {
    title: string;
    dueDate?: string;
    amount?: number;
    status?: string;
    notes?: string;
  }
) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractMilestone.create({
    data: {
      contractId,
      title: data.title,
      dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
      amount: data.amount ?? 0,
      status: data.status ?? 'PLANNED',
      notes: data.notes
    }
  });
}

export async function listContractAmendments(contractId: number) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractAmendment.findMany({
    where: { contractId },
    orderBy: [{ amendmentDate: 'desc' }, { id: 'desc' }]
  });
}

export async function createContractAmendment(
  contractId: number,
  data: {
    title: string;
    amendmentDate?: string;
    valueChange?: number;
    status?: string;
    notes?: string;
    createdBy?: number;
  }
) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractAmendment.create({
    data: {
      contractId,
      title: data.title,
      amendmentDate: data.amendmentDate ? parseDateOrThrow(data.amendmentDate, 'amendmentDate') : new Date(),
      valueChange: data.valueChange ?? 0,
      status: data.status ?? 'PENDING',
      notes: data.notes,
      createdBy: data.createdBy ?? null
    }
  });
}

export async function listContractAlerts(contractId: number) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractAlert.findMany({
    where: { contractId },
    orderBy: [{ dueDate: 'asc' }, { id: 'desc' }]
  });
}

export async function createContractAlert(
  contractId: number,
  data: {
    alertType: string;
    dueDate?: string;
    message?: string;
    status?: string;
  }
) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return prisma.contractAlert.create({
    data: {
      contractId,
      alertType: data.alertType,
      dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
      message: data.message,
      status: data.status ?? 'OPEN'
    }
  });
}

export async function resolveContractAlert(
  alertId: number,
  data?: {
    resolvedAt?: string;
    status?: string;
  }
) {
  const current = await prisma.contractAlert.findUnique({ where: { id: alertId } });
  if (!current) throw Errors.notFound('تنبيه العقد غير موجود');
  return prisma.contractAlert.update({
    where: { id: alertId },
    data: {
      status: data?.status ?? 'RESOLVED',
      resolvedAt: data?.resolvedAt ? parseDateOrThrow(data.resolvedAt, 'resolvedAt') : new Date()
    }
  });
}

export async function convertContractToProject(
  contractId: number,
  data: {
    branchId?: number;
    code?: string;
    nameAr?: string;
    nameEn?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    description?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw Errors.notFound('العقد غير موجود');
    if (['TERMINATED', 'CLOSED'].includes(String(contract.status).toUpperCase())) {
      throw Errors.business('لا يمكن تحويل عقد مغلق أو منتهي إلى مشروع');
    }

    const existingProject = await tx.project.findFirst({ where: { contractId }, orderBy: { id: 'desc' } });
    if (existingProject) {
      return {
        duplicate: true,
        contractId,
        projectId: existingProject.id,
        projectCode: existingProject.code
      };
    }

    const branchId = data.branchId ?? contract.branchId ?? null;
    await ensureBranchExists(tx, branchId);

    const code =
      data.code ??
      (
        await reserveNextSequenceInDb(tx, {
          documentType: 'PRJ',
          branchId,
          date: data.startDate ?? contract.startDate
        })
      ).number;

    const project = await tx.project.create({
      data: {
        code,
        nameAr: data.nameAr ?? contract.title,
        nameEn: data.nameEn,
        branchId,
        contractId: contract.id,
        type: data.type ?? contract.type,
        status: data.status ?? 'PLANNED',
        startDate: data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : contract.startDate,
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : contract.endDate,
        budget: data.budget ?? Number(contract.value ?? 0),
        description: data.description ?? contract.terms,
        actualCost: 0,
        isActive: true
      }
    });

    if (String(contract.status).toUpperCase() === 'APPROVED') {
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'ACTIVE' }
      });
    }

    return {
      duplicate: false,
      contractId,
      projectId: project.id,
      projectCode: project.code
    };
  });
}
