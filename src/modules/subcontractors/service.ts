import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { reserveNextSequenceInDb } from '../numbering/service';
import { recalculateProjectActualCost } from '../projects/service';

type SubcontractDb = Prisma.TransactionClient | typeof prisma;

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

function toNumber(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(value ?? 0);
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function approvedCertificateStatuses() {
  return ['APPROVED', 'PARTIAL_PAID', 'PAID'];
}

function activePaymentStatuses() {
  return ['RECORDED', 'COMPLETED'];
}

async function ensureSubcontractorExists(db: SubcontractDb, subcontractorId: number) {
  const subcontractor = await db.subcontractor.findUnique({ where: { id: subcontractorId } });
  if (!subcontractor) throw Errors.validation('مقاول الباطن غير موجود');
  return subcontractor;
}

async function ensureBranchExists(db: SubcontractDb, branchId?: number | null) {
  if (!branchId) return null;
  const branch = await db.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
  return branch;
}

async function ensureProjectExists(db: SubcontractDb, projectId?: number | null) {
  if (!projectId) return null;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.validation('المشروع غير موجود');
  return project;
}

async function resolveContractReferences(
  db: SubcontractDb,
  data: { subcontractorId: number; branchId?: number | null; projectId?: number | null }
) {
  const [subcontractor, branch, project] = await Promise.all([
    ensureSubcontractorExists(db, data.subcontractorId),
    ensureBranchExists(db, data.branchId),
    ensureProjectExists(db, data.projectId)
  ]);

  const resolvedBranchId = data.branchId ?? project?.branchId ?? null;
  if (project?.branchId && resolvedBranchId && Number(project.branchId) !== Number(resolvedBranchId)) {
    throw Errors.validation('المشروع المحدد لا يتبع الفرع المحدد');
  }

  return { subcontractor, branch, project, resolvedBranchId };
}

async function loadContractForMutation(db: SubcontractDb, id: number) {
  const contract = await db.subcontractContract.findUnique({
    where: { id },
    include: {
      subcontractor: true,
      project: true,
      branch: true
    }
  });
  if (!contract) throw Errors.notFound('عقد مقاول الباطن غير موجود');
  return contract;
}

async function refreshContractFinancials(db: SubcontractDb, contractId: number) {
  const [certificateAggregate, paymentAggregate] = await Promise.all([
    db.subcontractCertificate.aggregate({
      where: {
        contractId,
        status: { in: approvedCertificateStatuses() }
      },
      _sum: { grossAmount: true }
    }),
    db.subcontractPayment.aggregate({
      where: {
        contractId,
        status: { in: activePaymentStatuses() }
      },
      _sum: { amount: true }
    })
  ]);

  return db.subcontractContract.update({
    where: { id: contractId },
    data: {
      certifiedAmount: toNumber(certificateAggregate._sum.grossAmount),
      paidAmount: toNumber(paymentAggregate._sum.amount)
    }
  });
}

function ensureMutableContractStatus(status: string) {
  if (['CLOSED', 'CANCELLED'].includes(String(status).toUpperCase())) {
    throw Errors.business('لا يمكن التعديل على عقد مغلق أو ملغي');
  }
}

export async function listSubcontractors(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SubcontractorWhereInput = {
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.specialty ? { specialty: { contains: String(query.specialty), mode: 'insensitive' } } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: String(query.search), mode: 'insensitive' } },
            { nameAr: { contains: String(query.search), mode: 'insensitive' } },
            { nameEn: { contains: String(query.search), mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.subcontractor.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: { contracts: true }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontractor.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getSubcontractor(id: number) {
  const subcontractor = await prisma.subcontractor.findUnique({
    where: { id },
    include: {
      contracts: {
        include: {
          project: true,
          branch: true
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
      }
    }
  });
  if (!subcontractor) throw Errors.notFound('مقاول الباطن غير موجود');
  return subcontractor;
}

export async function createSubcontractor(data: {
  code?: string;
  nameAr: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  specialty?: string;
  licenseNumber?: string;
  rating?: number;
  status?: string;
  notes?: string;
}) {
  return prisma.subcontractor.create({
    data: {
      code: data.code?.trim() || `SUB-${Date.now()}`,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      phone: data.phone,
      email: data.email,
      specialty: data.specialty,
      licenseNumber: data.licenseNumber,
      rating: roundAmount(Number(data.rating ?? 0)),
      status: data.status ?? 'ACTIVE',
      notes: data.notes
    }
  });
}

export async function updateSubcontractor(
  id: number,
  data: {
    code?: string;
    nameAr?: string;
    nameEn?: string | null;
    phone?: string | null;
    email?: string | null;
    specialty?: string | null;
    licenseNumber?: string | null;
    rating?: number;
    status?: string;
    notes?: string | null;
  }
) {
  const current = await prisma.subcontractor.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('مقاول الباطن غير موجود');

  return prisma.subcontractor.update({
    where: { id },
    data: {
      ...('code' in data ? { code: data.code?.trim() || current.code } : {}),
      ...('nameAr' in data ? { nameAr: data.nameAr } : {}),
      ...('nameEn' in data ? { nameEn: data.nameEn ?? null } : {}),
      ...('phone' in data ? { phone: data.phone ?? null } : {}),
      ...('email' in data ? { email: data.email ?? null } : {}),
      ...('specialty' in data ? { specialty: data.specialty ?? null } : {}),
      ...('licenseNumber' in data ? { licenseNumber: data.licenseNumber ?? null } : {}),
      ...('rating' in data ? { rating: roundAmount(Number(data.rating ?? 0)) } : {}),
      ...('status' in data ? { status: data.status } : {}),
      ...('notes' in data ? { notes: data.notes ?? null } : {})
    }
  });
}

export async function deleteSubcontractor(id: number) {
  const current = await prisma.subcontractor.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('مقاول الباطن غير موجود');
  const contractCount = await prisma.subcontractContract.count({ where: { subcontractorId: id } });
  if (contractCount > 0) throw Errors.business('لا يمكن حذف مقاول باطن مرتبط بعقود');
  await prisma.subcontractor.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listContracts(
  query: Record<string, unknown>,
  scope?: { branchIds?: number[]; projectIds?: number[] }
): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SubcontractContractWhereInput = {
    ...(query.subcontractorId ? { subcontractorId: Number(query.subcontractorId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.subcontractContract.findMany({
      where,
      skip,
      take: limit,
      include: {
        subcontractor: true,
        project: true,
        branch: true
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontractContract.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getContract(id: number) {
  const contract = await prisma.subcontractContract.findUnique({
    where: { id },
    include: {
      subcontractor: true,
      project: true,
      branch: true,
      workOrders: { orderBy: [{ issueDate: 'desc' }, { id: 'desc' }] },
      certificates: { orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }] },
      changeOrders: { orderBy: [{ requestedDate: 'desc' }, { id: 'desc' }] },
      payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }] }
    }
  });
  if (!contract) throw Errors.notFound('عقد مقاول الباطن غير موجود');
  return contract;
}

export async function createContract(data: {
  subcontractorId: number;
  branchId?: number;
  projectId?: number;
  title: string;
  scopeOfWork?: string;
  startDate: string;
  endDate?: string;
  amount?: number;
  retentionRate?: number;
  status?: string;
  terms?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const refs = await resolveContractReferences(tx, {
      subcontractorId: Number(data.subcontractorId),
      branchId: data.branchId ?? null,
      projectId: data.projectId ?? null
    });

    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'SCON',
      branchId: refs.resolvedBranchId,
      date: data.startDate
    });

    return tx.subcontractContract.create({
      data: {
        number: sequence.number,
        subcontractorId: data.subcontractorId,
        branchId: refs.resolvedBranchId,
        projectId: data.projectId ?? null,
        title: data.title,
        scopeOfWork: data.scopeOfWork,
        startDate: parseDateOrThrow(data.startDate, 'startDate'),
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null,
        amount: roundAmount(Number(data.amount ?? 0)),
        retentionRate: roundAmount(Number(data.retentionRate ?? 0)),
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
    projectId?: number | null;
    title?: string;
    scopeOfWork?: string | null;
    startDate?: string;
    endDate?: string | null;
    amount?: number;
    retentionRate?: number;
    status?: string;
    terms?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await loadContractForMutation(tx, id);
    ensureMutableContractStatus(current.status);

    const nextProjectId = data.projectId === undefined ? current.projectId : data.projectId;
    const nextBranchId = data.branchId === undefined ? current.branchId : data.branchId;
    const project = await ensureProjectExists(tx, nextProjectId);
    const resolvedBranchId = nextBranchId ?? project?.branchId ?? null;
    await ensureBranchExists(tx, resolvedBranchId);
    if (project?.branchId && resolvedBranchId && Number(project.branchId) !== Number(resolvedBranchId)) {
      throw Errors.validation('المشروع المحدد لا يتبع الفرع المحدد');
    }

    const nextAmount = 'amount' in data ? roundAmount(Number(data.amount ?? 0)) : toNumber(current.amount);
    if (nextAmount + Number.EPSILON < toNumber(current.certifiedAmount)) {
      throw Errors.business('لا يمكن تخفيض قيمة العقد إلى أقل من قيمة المستخلصات المعتمدة');
    }

    return tx.subcontractContract.update({
      where: { id },
      data: {
        ...('branchId' in data ? { branchId: resolvedBranchId } : {}),
        ...('projectId' in data ? { projectId: nextProjectId ?? null } : {}),
        ...('title' in data ? { title: data.title } : {}),
        ...('scopeOfWork' in data ? { scopeOfWork: data.scopeOfWork ?? null } : {}),
        ...('startDate' in data ? { startDate: parseDateOrThrow(data.startDate!, 'startDate') } : {}),
        ...('endDate' in data ? { endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null } : {}),
        ...('amount' in data ? { amount: nextAmount } : {}),
        ...('retentionRate' in data ? { retentionRate: roundAmount(Number(data.retentionRate ?? 0)) } : {}),
        ...('status' in data ? { status: data.status } : {}),
        ...('terms' in data ? { terms: data.terms ?? null } : {})
      }
    });
  });
}

export async function deleteContract(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractContract.findUnique({
      where: { id },
      include: {
        workOrders: true,
        certificates: true,
        changeOrders: true,
        payments: true
      }
    });
    if (!current) throw Errors.notFound('عقد مقاول الباطن غير موجود');
    if (current.workOrders.length || current.certificates.length || current.changeOrders.length || current.payments.length) {
      throw Errors.business('لا يمكن حذف عقد مرتبط بحركات أو مستخلصات أو دفعات');
    }
    await tx.subcontractContract.delete({ where: { id } });
    return { deleted: true, id };
  });
}

export async function createWorkOrder(
  contractId: number,
  data: {
    title: string;
    description?: string;
    issueDate?: string;
    amount?: number;
    status?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await loadContractForMutation(tx, contractId);
    ensureMutableContractStatus(contract.status);

    const issueDate = data.issueDate ? parseDateOrThrow(data.issueDate, 'issueDate') : new Date();
    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'SCWO',
      branchId: contract.branchId ?? null,
      date: issueDate
    });

    if (String(contract.status).toUpperCase() === 'DRAFT') {
      await tx.subcontractContract.update({
        where: { id: contract.id },
        data: { status: 'ACTIVE' }
      });
    }

    return tx.subcontractWorkOrder.create({
      data: {
        contractId,
        number: sequence.number,
        title: data.title,
        description: data.description,
        issueDate,
        amount: roundAmount(Number(data.amount ?? 0)),
        status: data.status ?? 'ISSUED'
      }
    });
  });
}

export async function createChangeOrder(
  contractId: number,
  data: {
    title: string;
    description?: string;
    amount: number;
    requestedDate?: string;
    status?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await loadContractForMutation(tx, contractId);
    ensureMutableContractStatus(contract.status);

    const requestedDate = data.requestedDate ? parseDateOrThrow(data.requestedDate, 'requestedDate') : new Date();
    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'SCCH',
      branchId: contract.branchId ?? null,
      date: requestedDate
    });

    return tx.subcontractChangeOrder.create({
      data: {
        contractId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        number: sequence.number,
        title: data.title,
        description: data.description,
        amount: roundAmount(Number(data.amount ?? 0)),
        requestedDate,
        status: data.status ?? 'DRAFT'
      }
    });
  });
}

export async function approveChangeOrder(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractChangeOrder.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('أمر التغيير غير موجود');
    if (String(current.status).toUpperCase() === 'APPROVED') throw Errors.business('تم اعتماد أمر التغيير مسبقاً');
    if (String(current.status).toUpperCase() === 'CANCELLED') throw Errors.business('لا يمكن اعتماد أمر تغيير ملغي');

    const changeOrder = await tx.subcontractChangeOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date()
      }
    });

    await tx.subcontractContract.update({
      where: { id: current.contractId },
      data: {
        amount: { increment: current.amount }
      }
    });

    return changeOrder;
  });
}

export async function createCertificate(
  contractId: number,
  data: {
    periodFrom?: string;
    periodTo?: string;
    certificateDate?: string;
    progressPercent?: number;
    grossAmount: number;
    retentionAmount?: number;
    notes?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const contract = await loadContractForMutation(tx, contractId);
    ensureMutableContractStatus(contract.status);

    const certificateDate = data.certificateDate ? parseDateOrThrow(data.certificateDate, 'certificateDate') : new Date();
    const grossAmount = roundAmount(Number(data.grossAmount ?? 0));
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) throw Errors.validation('قيمة المستخلص غير صالحة');

    const retentionAmount =
      data.retentionAmount !== undefined
        ? roundAmount(Number(data.retentionAmount))
        : roundAmount(grossAmount * (toNumber(contract.retentionRate) / 100));
    if (retentionAmount < 0 || retentionAmount > grossAmount) {
      throw Errors.validation('قيمة الاحتجاز غير صالحة');
    }

    const netAmount = roundAmount(grossAmount - retentionAmount);
    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'SCCF',
      branchId: contract.branchId ?? null,
      date: certificateDate
    });

    return tx.subcontractCertificate.create({
      data: {
        contractId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        number: sequence.number,
        periodFrom: data.periodFrom ? parseDateOrThrow(data.periodFrom, 'periodFrom') : null,
        periodTo: data.periodTo ? parseDateOrThrow(data.periodTo, 'periodTo') : null,
        certificateDate,
        progressPercent: roundAmount(Number(data.progressPercent ?? 0)),
        grossAmount,
        retentionAmount,
        netAmount,
        notes: data.notes,
        status: 'DRAFT'
      }
    });
  });
}

export async function listCertificates(
  query: Record<string, unknown>,
  scope?: { branchIds?: number[]; projectIds?: number[] }
): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SubcontractCertificateWhereInput = {
    ...(query.contractId ? { contractId: Number(query.contractId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.subcontractCertificate.findMany({
      where,
      skip,
      take: limit,
      include: {
        contract: { include: { subcontractor: true } },
        project: true,
        branch: true
      },
      orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontractCertificate.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getCertificate(id: number) {
  const certificate = await prisma.subcontractCertificate.findUnique({
    where: { id },
    include: {
      contract: { include: { subcontractor: true } },
      project: true,
      branch: true,
      projectExpense: true,
      payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }] }
    }
  });
  if (!certificate) throw Errors.notFound('المستخلص غير موجود');
  return certificate;
}

export async function updateCertificate(
  id: number,
  data: {
    periodFrom?: string | null;
    periodTo?: string | null;
    certificateDate?: string;
    progressPercent?: number;
    grossAmount?: number;
    retentionAmount?: number;
    notes?: string | null;
    status?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractCertificate.findUnique({
      where: { id },
      include: { payments: true }
    });
    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (String(current.status).toUpperCase() !== 'DRAFT') {
      throw Errors.business('يمكن تعديل المستخلص في حالة المسودة فقط');
    }
    if (current.payments.length > 0) {
      throw Errors.business('لا يمكن تعديل مستخلص مرتبط بدفعات');
    }

    const grossAmount = 'grossAmount' in data ? roundAmount(Number(data.grossAmount ?? 0)) : toNumber(current.grossAmount);
    const retentionAmount =
      'retentionAmount' in data
        ? roundAmount(Number(data.retentionAmount ?? 0))
        : toNumber(current.retentionAmount);
    if (grossAmount <= 0 || retentionAmount < 0 || retentionAmount > grossAmount) {
      throw Errors.validation('قيمة المستخلص أو الاحتجاز غير صالحة');
    }

    return tx.subcontractCertificate.update({
      where: { id },
      data: {
        ...('periodFrom' in data ? { periodFrom: data.periodFrom ? parseDateOrThrow(data.periodFrom, 'periodFrom') : null } : {}),
        ...('periodTo' in data ? { periodTo: data.periodTo ? parseDateOrThrow(data.periodTo, 'periodTo') : null } : {}),
        ...('certificateDate' in data ? { certificateDate: parseDateOrThrow(data.certificateDate!, 'certificateDate') } : {}),
        ...('progressPercent' in data ? { progressPercent: roundAmount(Number(data.progressPercent ?? 0)) } : {}),
        ...('grossAmount' in data ? { grossAmount } : {}),
        ...('retentionAmount' in data ? { retentionAmount } : {}),
        ...('notes' in data ? { notes: data.notes ?? null } : {}),
        ...('status' in data ? { status: data.status } : {}),
        netAmount: roundAmount(grossAmount - retentionAmount)
      }
    });
  });
}

export async function approveCertificate(id: number) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.subcontractCertificate.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            subcontractor: true,
            project: true
          }
        }
      }
    });
    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (String(current.status).toUpperCase() !== 'DRAFT') {
      throw Errors.business('تم اعتماد المستخلص مسبقاً أو لم يعد قابلاً للاعتماد');
    }

    let createdExpense: any = null;
    if (current.projectId && toNumber(current.grossAmount) > 0) {
      createdExpense = await tx.projectExpense.create({
        data: {
          projectId: current.projectId,
          date: current.certificateDate,
          category: 'SUBCONTRACTOR',
          description: `مستخلص مقاول باطن ${current.contract.subcontractor.nameAr}`,
          amount: toNumber(current.grossAmount),
          reference: current.number
        }
      });
      await recalculateProjectActualCost(current.projectId, tx);
    }

    const certificate = await tx.subcontractCertificate.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        projectExpenseId: createdExpense?.id ?? current.projectExpenseId
      },
      include: {
        contract: {
          include: {
            subcontractor: true
          }
        },
        project: true,
        branch: true,
        projectExpense: true
      }
    });

    await refreshContractFinancials(tx, current.contractId);
    if (String(current.contract.status).toUpperCase() === 'DRAFT') {
      await tx.subcontractContract.update({
        where: { id: current.contractId },
        data: { status: 'ACTIVE' }
      });
    }

    return { certificate, projectExpense: createdExpense };
  });

  if (result.projectExpense) {
    emitAccountingEvent('project.expense.recorded', {
      recordId: result.projectExpense.id,
      projectId: result.projectExpense.projectId,
      phaseId: result.projectExpense.phaseId,
      amount: toNumber(result.projectExpense.amount),
      category: result.projectExpense.category,
      reference: result.projectExpense.reference
    });
  }

  emitAccountingEvent('subcontract.certificate.approved', {
    recordId: result.certificate.id,
    contractId: result.certificate.contractId,
    subcontractorId: result.certificate.contract.subcontractorId,
    projectId: result.certificate.projectId,
    branchId: result.certificate.branchId,
    grossAmount: toNumber(result.certificate.grossAmount),
    retentionAmount: toNumber(result.certificate.retentionAmount),
    netAmount: toNumber(result.certificate.netAmount),
    reference: result.certificate.number
  });

  return result.certificate;
}

export async function deleteCertificate(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractCertificate.findUnique({
      where: { id },
      include: { payments: true }
    });
    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (String(current.status).toUpperCase() !== 'DRAFT' || current.projectExpenseId) {
      throw Errors.business('لا يمكن حذف مستخلص معتمد أو مرتبط بتكلفة مشروع');
    }
    if (current.payments.length > 0) throw Errors.business('لا يمكن حذف مستخلص مرتبط بدفعات');
    await tx.subcontractCertificate.delete({ where: { id } });
    return { deleted: true, id };
  });
}

export async function createPayment(data: {
  contractId?: number;
  certificateId?: number;
  paymentDate?: string;
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const certificate = data.certificateId
      ? await tx.subcontractCertificate.findUnique({
          where: { id: Number(data.certificateId) },
          include: { contract: true }
        })
      : null;
    const contractId = certificate?.contractId ?? data.contractId;
    if (!contractId) throw Errors.validation('يجب تحديد العقد أو المستخلص');

    const contract = certificate?.contract ?? (await loadContractForMutation(tx, Number(contractId)));
    ensureMutableContractStatus(contract.status);

    const amount = roundAmount(Number(data.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) throw Errors.validation('قيمة الدفعة غير صالحة');

    let updatedCertificate: any = null;
    if (certificate) {
      const currentStatus = String(certificate.status).toUpperCase();
      if (!approvedCertificateStatuses().includes(currentStatus)) {
        throw Errors.business('يجب اعتماد المستخلص قبل تسجيل الدفعات');
      }

      const remaining = roundAmount(toNumber(certificate.netAmount) - toNumber(certificate.paidAmount));
      if (amount > remaining + 0.000001) {
        throw Errors.business('قيمة الدفعة تتجاوز صافي المستخلص المتبقي');
      }

      updatedCertificate = await tx.subcontractCertificate.update({
        where: { id: certificate.id },
        data: {
          paidAmount: { increment: amount },
          status:
            amount + toNumber(certificate.paidAmount) + 0.000001 >= toNumber(certificate.netAmount)
              ? 'PAID'
              : 'PARTIAL_PAID'
        }
      });
    }

    const payment = await tx.subcontractPayment.create({
      data: {
        contractId: contract.id,
        certificateId: certificate?.id ?? null,
        projectId: certificate?.projectId ?? contract.projectId,
        branchId: certificate?.branchId ?? contract.branchId,
        paymentDate: data.paymentDate ? parseDateOrThrow(data.paymentDate, 'paymentDate') : new Date(),
        amount,
        method: data.method,
        reference: data.reference,
        status: 'RECORDED',
        notes: data.notes
      },
      include: {
        contract: {
          include: {
            subcontractor: true
          }
        },
        certificate: true,
        project: true,
        branch: true
      }
    });

    await refreshContractFinancials(tx, contract.id);
    return { payment, certificate: updatedCertificate };
  });

  emitAccountingEvent('subcontract.payment.recorded', {
    recordId: result.payment.id,
    contractId: result.payment.contractId,
    certificateId: result.payment.certificateId,
    subcontractorId: result.payment.contract.subcontractorId,
    projectId: result.payment.projectId,
    branchId: result.payment.branchId,
    amount: toNumber(result.payment.amount),
    reference: result.payment.reference
  });

  return result.payment;
}

export async function listPayments(
  query: Record<string, unknown>,
  scope?: { branchIds?: number[]; projectIds?: number[] }
): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SubcontractPaymentWhereInput = {
    ...(query.contractId ? { contractId: Number(query.contractId) } : {}),
    ...(query.certificateId ? { certificateId: Number(query.certificateId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.subcontractPayment.findMany({
      where,
      skip,
      take: limit,
      include: {
        contract: {
          include: {
            subcontractor: true
          }
        },
        certificate: true,
        project: true,
        branch: true
      },
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontractPayment.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getPayment(id: number) {
  const payment = await prisma.subcontractPayment.findUnique({
    where: { id },
    include: {
      contract: {
        include: {
          subcontractor: true
        }
      },
      certificate: true,
      project: true,
      branch: true
    }
  });
  if (!payment) throw Errors.notFound('دفعة مقاول الباطن غير موجودة');
  return payment;
}

export async function getPerformanceReport(query: Record<string, unknown>, scope?: { branchIds?: number[]; projectIds?: number[] }) {
  const subcontractors = await prisma.subcontractor.findMany({
    include: {
      contracts: {
        where: {
          ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
          ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
          ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
          ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {})
        },
        include: {
          certificates: true,
          payments: true
        }
      }
    },
    orderBy: [{ nameAr: 'asc' }, { id: 'asc' }]
  });

  return subcontractors
    .map((subcontractor) => {
      const contracts = subcontractor.contracts;
      const activeContracts = contracts.filter((row) => ['ACTIVE', 'DRAFT'].includes(String(row.status).toUpperCase())).length;
      const certifiedAmount = contracts.reduce((sum, row) => sum + toNumber(row.certifiedAmount), 0);
      const paidAmount = contracts.reduce((sum, row) => sum + toNumber(row.paidAmount), 0);
      const contractAmount = contracts.reduce((sum, row) => sum + toNumber(row.amount), 0);
      const certificateCount = contracts.reduce((sum, row) => sum + row.certificates.length, 0);
      const paymentCount = contracts.reduce((sum, row) => sum + row.payments.length, 0);

      return {
        id: subcontractor.id,
        code: subcontractor.code,
        nameAr: subcontractor.nameAr,
        specialty: subcontractor.specialty,
        rating: toNumber(subcontractor.rating),
        contractCount: contracts.length,
        activeContracts,
        contractAmount: roundAmount(contractAmount),
        certifiedAmount: roundAmount(certifiedAmount),
        paidAmount: roundAmount(paidAmount),
        outstandingAmount: roundAmount(certifiedAmount - paidAmount),
        certificateCount,
        paymentCount
      };
    })
    .filter((row) => row.contractCount > 0 || !query.branchId);
}
