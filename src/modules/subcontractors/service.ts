import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { createInvoiceInTransaction } from '../invoices/service';
import * as paymentsService from '../payments/service';

function normalizeAmount(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Errors.validation(`${fieldName} غير صالح`);
  }
  return Math.round(amount * 100) / 100;
}

function normalizeRate(value: unknown, fieldName: string, fallback = 0): number {
  const rate = normalizeAmount(value ?? fallback, fieldName) ?? fallback;
  if (rate < 0 || rate > 100) {
    throw Errors.validation(`${fieldName} يجب أن يكون بين 0 و100`);
  }
  return rate;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function generateSubcontractNumber(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.subcontract.findFirst({
    where: {
      number: {
        startsWith: `SUB-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest('SUB', latest?.number, year);
}

async function generateIpcNumber(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.subcontractIpc.findFirst({
    where: {
      number: {
        startsWith: `IPC-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest('IPC', latest?.number, year);
}

async function resolveSubcontractContext(tx: any, data: any, current: any = null) {
  const supplierId = Number(data.supplierId ?? current?.supplierId ?? 0) || null;
  const projectId = Number(data.projectId ?? current?.projectId ?? 0) || null;

  if (!supplierId) throw Errors.validation('يجب تحديد المقاول من الباطن');
  if (!projectId) throw Errors.validation('يجب تحديد المشروع');

  const [supplier, project] = await Promise.all([
    tx.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, code: true, nameAr: true, branchId: true, paymentTerms: true }
    }),
    tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, nameAr: true, branchId: true, status: true }
    })
  ]);

  if (!supplier) throw Errors.notFound('المقاول من الباطن غير موجود');
  if (!project) throw Errors.notFound('المشروع غير موجود');

  const branchId = Number(data.branchId ?? current?.branchId ?? project.branchId ?? supplier.branchId ?? 0) || null;
  return { supplier, supplierId, project, projectId, branchId };
}

async function getApprovedCertifiedTotal(tx: any, subcontractId: number, excludeIpcId?: number) {
  const rows = await tx.subcontractIpc.findMany({
    where: {
      subcontractId,
      approvalStatus: 'APPROVED',
      ...(excludeIpcId ? { id: { not: excludeIpcId } } : {})
    },
    select: { certifiedAmount: true }
  });
  return Math.round(rows.reduce((sum: number, row: any) => sum + Number(row.certifiedAmount ?? 0), 0) * 100) / 100;
}

async function refreshIpcStatusFromInvoice(tx: any, ipcId: number) {
  const ipc = await tx.subcontractIpc.findUnique({
    where: { id: ipcId },
    include: {
      payableInvoice: {
        select: {
          id: true,
          status: true,
          paidAmount: true,
          outstanding: true
        }
      }
    }
  });
  if (!ipc) throw Errors.notFound('المستخلص غير موجود');
  if (!ipc.payableInvoice) return ipc;

  let status = ipc.status;
  let paidAt = ipc.paidAt;
  const outstanding = Number(ipc.payableInvoice.outstanding ?? 0);
  const paidAmount = Number(ipc.payableInvoice.paidAmount ?? 0);

  if (outstanding <= 0.01) {
    status = 'PAID';
    paidAt = paidAt ?? new Date();
  } else if (paidAmount > 0) {
    status = 'PARTIAL';
  } else if (ipc.approvalStatus === 'APPROVED') {
    status = 'CERTIFIED';
  }

  if (status !== ipc.status || paidAt !== ipc.paidAt) {
    return tx.subcontractIpc.update({
      where: { id: ipcId },
      data: {
        status,
        paidAt
      }
    });
  }

  return ipc;
}

async function recomputeSubcontractTotals(tx: any, subcontractId: number) {
  const ipcs = await tx.subcontractIpc.findMany({
    where: { subcontractId },
    include: {
      payableInvoice: {
        select: {
          total: true,
          paidAmount: true,
          outstanding: true
        }
      }
    }
  });

  const certifiedAmount = Math.round(
    ipcs
      .filter((row: any) => row.approvalStatus === 'APPROVED')
      .reduce((sum: number, row: any) => sum + Number(row.certifiedAmount ?? 0), 0) * 100
  ) / 100;

  const retentionHeld = Math.round(
    ipcs
      .filter((row: any) => row.approvalStatus === 'APPROVED')
      .reduce((sum: number, row: any) => sum + Number(row.retentionAmount ?? 0), 0) * 100
  ) / 100;

  const paidAmount = Math.round(
    ipcs.reduce((sum: number, row: any) => sum + Number(row.payableInvoice?.paidAmount ?? 0), 0) * 100
  ) / 100;

  const outstandingAmount = Math.round(
    ipcs.reduce((sum: number, row: any) => sum + Number(row.payableInvoice?.outstanding ?? row.netAmount ?? 0), 0) * 100
  ) / 100;

  return tx.subcontract.update({
    where: { id: subcontractId },
    data: {
      certifiedAmount,
      retentionHeld,
      paidAmount,
      outstandingAmount
    }
  });
}

async function fetchSubcontract(tx: any, id: number) {
  const subcontract = await tx.subcontract.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      supplier: { select: { id: true, code: true, nameAr: true, paymentTerms: true } },
      project: { select: { id: true, code: true, nameAr: true, status: true } },
      ipcs: {
        orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }],
        include: {
          payableInvoice: {
            include: {
              payments: {
                include: {
                  payment: {
                    select: {
                      id: true,
                      number: true,
                      amount: true,
                      status: true,
                      date: true,
                      method: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!subcontract) throw Errors.notFound('عقد المقاول من الباطن غير موجود');
  return subcontract;
}

async function fetchIpc(tx: any, id: number) {
  const ipc = await tx.subcontractIpc.findUnique({
    where: { id },
    include: {
      subcontract: {
        include: {
          branch: { select: { id: true, code: true, nameAr: true } },
          supplier: { select: { id: true, code: true, nameAr: true, paymentTerms: true } },
          project: { select: { id: true, code: true, nameAr: true } }
        }
      },
      payableInvoice: {
        include: {
          payments: {
            include: {
              payment: {
                select: {
                  id: true,
                  number: true,
                  amount: true,
                  status: true,
                  method: true,
                  date: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!ipc) throw Errors.notFound('المستخلص غير موجود');
  return ipc;
}

export async function listSubcontracts(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.status) where.status = String(query.status);
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { workOrderNumber: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.subcontract.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        supplier: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        ipcs: {
          orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }],
          take: 3,
          include: {
            payableInvoice: {
              select: {
                id: true,
                number: true,
                total: true,
                paidAmount: true,
                outstanding: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontract.count({ where })
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

export async function getSubcontract(id: number) {
  return prisma.$transaction((tx) => fetchSubcontract(tx, id));
}

export async function createSubcontract(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const { supplierId, projectId, branchId } = await resolveSubcontractContext(tx, data);
    const contractValue = normalizeAmount(data.contractValue, 'قيمة العقد') ?? 0;
    const retentionRate = normalizeRate(data.retentionRate, 'نسبة الاحتجاز');

    const subcontract = await tx.subcontract.create({
      data: {
        number: data.number ?? (await generateSubcontractNumber(tx)),
        branchId,
        supplierId,
        projectId,
        title: String(data.title ?? '').trim(),
        scope: normalizeText(data.scope),
        workOrderNumber: normalizeText(data.workOrderNumber),
        startDate: data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : null,
        endDate: data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null,
        contractValue,
        retentionRate,
        performanceRating: data.performanceRating ? Number(data.performanceRating) : null,
        notes: normalizeText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.subcontract.created',
      aggregateType: 'Subcontract',
      aggregateId: String(subcontract.id),
      actorId: userId,
      branchId,
      correlationId: `subcontract:${subcontract.id}:created`,
      payload: {
        subcontractId: subcontract.id,
        number: subcontract.number,
        supplierId,
        projectId,
        contractValue
      }
    });

    return fetchSubcontract(tx, subcontract.id);
  });
}

export async function updateSubcontract(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('عقد المقاول من الباطن غير موجود');
    if (current.status === 'CLOSED') throw Errors.business('لا يمكن تعديل عقد مغلق');

    const { supplierId, projectId, branchId } = await resolveSubcontractContext(tx, data, current);
    const contractValue = normalizeAmount(data.contractValue ?? current.contractValue, 'قيمة العقد') ?? 0;
    const retentionRate = normalizeRate(data.retentionRate ?? current.retentionRate, 'نسبة الاحتجاز');

    await tx.subcontract.update({
      where: { id },
      data: {
        branchId,
        supplierId,
        projectId,
        title: String(data.title ?? current.title).trim(),
        scope: normalizeText(data.scope ?? current.scope),
        workOrderNumber: normalizeText(data.workOrderNumber ?? current.workOrderNumber),
        startDate: data.startDate !== undefined ? (data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : null) : current.startDate,
        endDate: data.endDate !== undefined ? (data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null) : current.endDate,
        contractValue,
        retentionRate,
        performanceRating: data.performanceRating !== undefined ? (data.performanceRating ? Number(data.performanceRating) : null) : current.performanceRating,
        notes: normalizeText(data.notes ?? current.notes),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.subcontract.updated',
      aggregateType: 'Subcontract',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `subcontract:${id}:updated`,
      payload: {
        subcontractId: id,
        supplierId,
        projectId,
        contractValue
      }
    });

    return fetchSubcontract(tx, id);
  });
}

export async function activateSubcontract(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontract.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('عقد المقاول من الباطن غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('يمكن تفعيل العقود المسودة فقط');

    await tx.subcontract.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        activatedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.subcontract.activated',
      aggregateType: 'Subcontract',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `subcontract:${id}:activated`,
      payload: {
        subcontractId: id,
        number: current.number,
        supplierId: current.supplierId,
        projectId: current.projectId
      }
    });

    return fetchSubcontract(tx, id);
  });
}

export async function listIpcs(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.subcontractId) where.subcontractId = Number(query.subcontractId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  const relationFilter: Record<string, unknown> = {};
  if (query.projectId) relationFilter.projectId = Number(query.projectId);
  if (query.supplierId) relationFilter.supplierId = Number(query.supplierId);
  if (Object.keys(relationFilter).length) {
    where.subcontract = { is: relationFilter };
  }
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { subcontract: { is: { number: { contains: search, mode: 'insensitive' } } } },
        { subcontract: { is: { title: { contains: search, mode: 'insensitive' } } } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.subcontractIpc.findMany({
      where,
      skip,
      take: limit,
      include: {
        subcontract: {
          include: {
            branch: { select: { id: true, code: true, nameAr: true } },
            supplier: { select: { id: true, code: true, nameAr: true } },
            project: { select: { id: true, code: true, nameAr: true } }
          }
        },
        payableInvoice: {
          include: {
            payments: {
              include: {
                payment: {
                  select: {
                    id: true,
                    number: true,
                    amount: true,
                    status: true,
                    date: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.subcontractIpc.count({ where })
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

export async function getIpc(id: number) {
  return prisma.$transaction((tx) => fetchIpc(tx, id));
}

export async function createIpc(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const subcontract = await tx.subcontract.findUnique({
      where: { id: Number(data.subcontractId) },
      include: {
        supplier: { select: { id: true, paymentTerms: true } }
      }
    });
    if (!subcontract) throw Errors.notFound('عقد المقاول من الباطن غير موجود');
    if (subcontract.status !== 'ACTIVE') throw Errors.business('يجب تفعيل العقد قبل إنشاء المستخلص');

    const claimedAmount = normalizeAmount(data.claimedAmount, 'القيمة المطالب بها') ?? 0;
    const certifiedAmount = normalizeAmount(data.certifiedAmount ?? claimedAmount, 'القيمة المعتمدة') ?? 0;
    if (certifiedAmount > claimedAmount) {
      throw Errors.business('القيمة المعتمدة لا يمكن أن تتجاوز القيمة المطالب بها');
    }

    const previousCertifiedAmount = await getApprovedCertifiedTotal(tx, subcontract.id);
    const retentionRate = normalizeRate(data.retentionRate ?? subcontract.retentionRate, 'نسبة الاحتجاز');
    const retentionAmount = Math.round((certifiedAmount * retentionRate) * 100) / 10000;
    const netAmount = Math.round((certifiedAmount - retentionAmount) * 100) / 100;

    const ipc = await tx.subcontractIpc.create({
      data: {
        subcontractId: subcontract.id,
        number: data.number ?? (await generateIpcNumber(tx)),
        certificateDate: parseDateOrThrow(data.certificateDate, 'certificateDate'),
        periodStart: data.periodStart ? parseDateOrThrow(data.periodStart, 'periodStart') : null,
        periodEnd: data.periodEnd ? parseDateOrThrow(data.periodEnd, 'periodEnd') : null,
        claimedAmount,
        previousCertifiedAmount,
        certifiedAmount,
        retentionRate,
        retentionAmount,
        netAmount,
        notes: normalizeText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.ipc.created',
      aggregateType: 'SubcontractIpc',
      aggregateId: String(ipc.id),
      actorId: userId,
      branchId: subcontract.branchId,
      correlationId: `subcontract-ipc:${ipc.id}:created`,
      payload: {
        ipcId: ipc.id,
        number: ipc.number,
        subcontractId: subcontract.id,
        certifiedAmount,
        netAmount
      }
    });

    return fetchIpc(tx, ipc.id);
  });
}

export async function updateIpc(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractIpc.findUnique({
      where: { id },
      include: {
        subcontract: true
      }
    });
    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (current.approvalStatus === 'APPROVED' || current.payableInvoiceId) {
      throw Errors.business('لا يمكن تعديل مستخلص تم اعتماده أو تحويله إلى ذمة');
    }

    const claimedAmount = normalizeAmount(data.claimedAmount ?? current.claimedAmount, 'القيمة المطالب بها') ?? 0;
    const certifiedAmount = normalizeAmount(data.certifiedAmount ?? current.certifiedAmount, 'القيمة المعتمدة') ?? 0;
    if (certifiedAmount > claimedAmount) {
      throw Errors.business('القيمة المعتمدة لا يمكن أن تتجاوز القيمة المطالب بها');
    }

    const previousCertifiedAmount = await getApprovedCertifiedTotal(tx, current.subcontractId, id);
    const retentionRate = normalizeRate(data.retentionRate ?? current.retentionRate ?? current.subcontract.retentionRate, 'نسبة الاحتجاز');
    const retentionAmount = Math.round((certifiedAmount * retentionRate) * 100) / 10000;
    const netAmount = Math.round((certifiedAmount - retentionAmount) * 100) / 100;

    await tx.subcontractIpc.update({
      where: { id },
      data: {
        number: data.number ?? current.number,
        certificateDate: data.certificateDate ? parseDateOrThrow(data.certificateDate, 'certificateDate') : current.certificateDate,
        periodStart: data.periodStart !== undefined ? (data.periodStart ? parseDateOrThrow(data.periodStart, 'periodStart') : null) : current.periodStart,
        periodEnd: data.periodEnd !== undefined ? (data.periodEnd ? parseDateOrThrow(data.periodEnd, 'periodEnd') : null) : current.periodEnd,
        claimedAmount,
        previousCertifiedAmount,
        certifiedAmount,
        retentionRate,
        retentionAmount,
        netAmount,
        notes: normalizeText(data.notes ?? current.notes),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.ipc.updated',
      aggregateType: 'SubcontractIpc',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.subcontract.branchId,
      correlationId: `subcontract-ipc:${id}:updated`,
      payload: {
        ipcId: id,
        subcontractId: current.subcontractId,
        certifiedAmount,
        netAmount
      }
    });

    return fetchIpc(tx, id);
  });
}

export async function submitIpc(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractIpc.findUnique({
      where: { id },
      include: { subcontract: true }
    });
    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('يمكن إرسال المستخلصات المسودة فقط');
    if (Number(current.certifiedAmount ?? 0) <= 0) throw Errors.business('القيمة المعتمدة يجب أن تكون أكبر من صفر');

    await tx.subcontractIpc.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.ipc.submitted',
      aggregateType: 'SubcontractIpc',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.subcontract.branchId,
      correlationId: `subcontract-ipc:${id}:submitted`,
      payload: {
        ipcId: id,
        number: current.number,
        subcontractId: current.subcontractId,
        netAmount: current.netAmount
      }
    });

    return fetchIpc(tx, id);
  });
}

export async function approveIpc(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subcontractIpc.findUnique({
      where: { id },
      include: {
        subcontract: {
          include: {
            supplier: { select: { id: true, paymentTerms: true } },
            project: { select: { id: true, nameAr: true } }
          }
        }
      }
    });

    if (!current) throw Errors.notFound('المستخلص غير موجود');
    if (current.approvalStatus === 'APPROVED' || current.payableInvoiceId) {
      throw Errors.business('تم اعتماد المستخلص وتحويله مسبقًا');
    }
    if (current.status !== 'SUBMITTED') throw Errors.business('يجب إرسال المستخلص قبل اعتماده');
    if (Number(current.netAmount ?? 0) <= 0) throw Errors.business('صافي المستخلص يجب أن يكون أكبر من صفر');

    const dueDate = addDays(new Date(current.certificateDate), Number(current.subcontract.supplier.paymentTerms ?? 30));

    const invoice = await createInvoiceInTransaction(
      tx,
      {
        type: 'PURCHASE',
        branchId: current.subcontract.branchId,
        supplierId: current.subcontract.supplierId,
        projectId: current.subcontract.projectId,
        date: current.certificateDate,
        dueDate,
        notes: `ذمة مورد ناتجة عن مستخلص ${current.number} ضمن عقد ${current.subcontract.number}`,
        lines: [
          {
            description: `مستخلص ${current.number} - ${current.subcontract.title}`,
            quantity: 1,
            unitPrice: Number(current.netAmount ?? 0),
            discount: 0,
            taxRate: 0
          }
        ]
      },
      userId,
      { issue: true }
    );

    await tx.subcontractIpc.update({
      where: { id },
      data: {
        status: 'CERTIFIED',
        approvalStatus: 'APPROVED',
        postingStatus: 'POSTED',
        payableInvoiceId: invoice.id,
        approvedAt: new Date(),
        updatedById: userId
      }
    });

    await refreshIpcStatusFromInvoice(tx, id);
    await recomputeSubcontractTotals(tx, current.subcontractId);

    await enqueueOutboxEvent(tx, {
      eventType: 'subcontractors.ipc.approved',
      aggregateType: 'SubcontractIpc',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.subcontract.branchId,
      correlationId: `subcontract-ipc:${id}:approved`,
      payload: {
        ipcId: id,
        number: current.number,
        subcontractId: current.subcontractId,
        payableInvoiceId: invoice.id,
        payableInvoiceNumber: invoice.number,
        netAmount: current.netAmount
      }
    });

    return fetchIpc(tx, id);
  });
}

export async function createIpcPayment(id: number, data: any, userId: number) {
  const ipc = await prisma.subcontractIpc.findUnique({
    where: { id },
    include: {
      subcontract: {
        include: {
          supplier: { select: { id: true, nameAr: true } }
        }
      },
      payableInvoice: {
        select: {
          id: true,
          number: true,
          total: true,
          paidAmount: true,
          outstanding: true,
          status: true
        }
      }
    }
  });

  if (!ipc) throw Errors.notFound('المستخلص غير موجود');
  if (!ipc.payableInvoiceId || !ipc.payableInvoice) {
    throw Errors.business('يجب اعتماد المستخلص وإنشاء الذمة قبل تسجيل الدفع');
  }

  const outstanding = Number(ipc.payableInvoice.outstanding ?? 0);
  if (outstanding <= 0.01) {
    throw Errors.business('هذا المستخلص مسدد بالكامل');
  }

  const amount = Math.min(normalizeAmount(data.amount ?? outstanding, 'مبلغ الدفع') ?? outstanding, outstanding);
  const payment = await paymentsService.createPayment(
    {
      type: 'PAYMENT',
      method: data.method ?? 'BANK_TRANSFER',
      amount,
      date: data.date,
      branchId: ipc.subcontract.branchId,
      supplierId: ipc.subcontract.supplierId,
      bankId: data.bankId,
      checkNumber: data.checkNumber,
      checkDate: data.checkDate,
      checkBank: data.checkBank,
      description: data.description ?? `دفعة مستخلص ${ipc.number}`,
      notes: data.notes ?? `سداد ذمة ${ipc.payableInvoice.number} لعقد ${ipc.subcontract.number}`,
      allocations: [{ invoiceId: ipc.payableInvoiceId, amount }]
    },
    userId
  );
  if (!payment) throw Errors.business('تعذر إنشاء دفعة المقاول');

  let paymentRecord: any = payment;
  if (data.completeImmediately !== false) {
    paymentRecord = await paymentsService.completePayment(Number(payment.id), userId);
  }

  return prisma.$transaction(async (tx) => {
    await refreshIpcStatusFromInvoice(tx, id);
    await recomputeSubcontractTotals(tx, ipc.subcontractId);

    const refreshed = await fetchIpc(tx, id);
    const refreshedOutstanding = Number(refreshed.payableInvoice?.outstanding ?? 0);

    await enqueueOutboxEvent(tx, {
      eventType: data.completeImmediately === false ? 'subcontractors.ipc.payment_requested' : 'subcontractors.ipc.paid',
      aggregateType: 'SubcontractIpc',
      aggregateId: String(id),
      actorId: userId,
      branchId: ipc.subcontract.branchId,
      correlationId: `subcontract-ipc:${id}:payment:${paymentRecord.id}`,
      payload: {
        ipcId: id,
        subcontractId: ipc.subcontractId,
        paymentId: paymentRecord.id,
        paymentNumber: paymentRecord.number,
        amount,
        payableInvoiceId: ipc.payableInvoiceId,
        outstanding: refreshedOutstanding
      }
    });

    return {
      ipc: refreshed,
      payment: paymentRecord
    };
  });
}
