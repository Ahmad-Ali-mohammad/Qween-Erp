import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { recalculateProjectActualCost } from '../projects/service';

type EquipmentDb = Prisma.TransactionClient | typeof prisma;

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

function calculateInclusiveDays(startDate: Date, endDate: Date) {
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) throw Errors.validation('تاريخ نهاية التشغيل يجب أن يكون بعد تاريخ البداية');
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function buildProjectExpenseEventPayload(expense: {
  id: number;
  projectId: number;
  phaseId: number | null;
  amount: Prisma.Decimal | string | number;
  category: string | null;
  reference: string | null;
}) {
  return {
    recordId: expense.id,
    projectId: expense.projectId,
    phaseId: expense.phaseId,
    amount: toNumber(expense.amount),
    category: expense.category,
    reference: expense.reference
  };
}

async function ensureAssetExists(tx: EquipmentDb, assetId: number) {
  const asset = await tx.fixedAsset.findUnique({
    where: { id: assetId },
    include: { category: true }
  });
  if (!asset) throw Errors.validation('المعدة أو الأصل غير موجود');
  if (['SOLD', 'SCRAPPED'].includes(String(asset.status).toUpperCase())) {
    throw Errors.business('لا يمكن التشغيل على أصل مباع أو مشطوب');
  }
  return asset;
}

async function ensureProjectExists(tx: EquipmentDb, projectId?: number | null) {
  if (!projectId) return null;
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.validation('المشروع غير موجود');
  return project;
}

async function ensureBranchExists(tx: EquipmentDb, branchId?: number | null) {
  if (!branchId) return null;
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
  return branch;
}

async function ensureSupplierExists(tx: EquipmentDb, supplierId?: number | null) {
  if (!supplierId) return null;
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw Errors.validation('المورد غير موجود');
  return supplier;
}

export async function listAllocations(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const projectIds = Array.isArray((query as any).projectIds) ? ((query as any).projectIds as number[]).map(Number) : [];
  const where: Prisma.EquipmentAllocationWhereInput = {
    ...(query.assetId ? { assetId: Number(query.assetId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.projectId && projectIds.length ? { projectId: { in: projectIds } } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentAllocation.findMany({
      where,
      skip,
      take: limit,
      include: {
        asset: true,
        project: true,
        branch: true,
        projectExpense: true
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.equipmentAllocation.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getAllocation(id: number) {
  const row = await prisma.equipmentAllocation.findUnique({
    where: { id },
    include: {
      asset: true,
      project: true,
      branch: true,
      projectExpense: true
    }
  });
  if (!row) throw Errors.notFound('تخصيص المعدة غير موجود');
  return row;
}

export async function createAllocation(data: {
  assetId: number;
  projectId?: number;
  branchId?: number;
  startDate?: string;
  dailyRate?: number;
  hourlyRate?: number;
  operatorId?: number;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureAssetExists(tx, Number(data.assetId));
    await ensureProjectExists(tx, data.projectId);
    await ensureBranchExists(tx, data.branchId);

    const activeAllocation = await tx.equipmentAllocation.findFirst({
      where: {
        assetId: Number(data.assetId),
        status: 'ACTIVE'
      },
      orderBy: { id: 'desc' }
    });
    if (activeAllocation) throw Errors.business('توجد عملية تخصيص نشطة لهذه المعدة');

    return tx.equipmentAllocation.create({
      data: {
        assetId: Number(data.assetId),
        projectId: data.projectId ?? null,
        branchId: data.branchId ?? null,
        startDate: data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : new Date(),
        dailyRate: roundAmount(Number(data.dailyRate ?? 0)),
        hourlyRate: roundAmount(Number(data.hourlyRate ?? 0)),
        operatorId: data.operatorId ?? null,
        status: 'ACTIVE',
        notes: data.notes ?? null
      }
    });
  });
}

export async function updateAllocation(
  id: number,
  data: {
    projectId?: number | null;
    branchId?: number | null;
    startDate?: string;
    dailyRate?: number;
    hourlyRate?: number;
    operatorId?: number | null;
    notes?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.equipmentAllocation.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('تخصيص المعدة غير موجود');
    if (current.status !== 'ACTIVE') throw Errors.business('يمكن تعديل تخصيص المعدة النشط فقط');

    await ensureProjectExists(tx, data.projectId === undefined ? current.projectId : data.projectId);
    await ensureBranchExists(tx, data.branchId === undefined ? current.branchId : data.branchId);

    return tx.equipmentAllocation.update({
      where: { id },
      data: {
        ...('projectId' in data ? { projectId: data.projectId ?? null } : {}),
        ...('branchId' in data ? { branchId: data.branchId ?? null } : {}),
        ...('startDate' in data ? { startDate: parseDateOrThrow(data.startDate!, 'startDate') } : {}),
        ...('dailyRate' in data ? { dailyRate: roundAmount(Number(data.dailyRate ?? 0)) } : {}),
        ...('hourlyRate' in data ? { hourlyRate: roundAmount(Number(data.hourlyRate ?? 0)) } : {}),
        ...('operatorId' in data ? { operatorId: data.operatorId ?? null } : {}),
        ...('notes' in data ? { notes: data.notes ?? null } : {})
      }
    });
  });
}

export async function closeAllocation(
  id: number,
  data: {
    endDate?: string;
    hoursUsed?: number;
    fuelCost?: number;
    notes?: string;
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.equipmentAllocation.findUnique({
      where: { id },
      include: { asset: true }
    });
    if (!current) throw Errors.notFound('تخصيص المعدة غير موجود');
    if (current.status !== 'ACTIVE') throw Errors.business('تم إغلاق التخصيص مسبقاً');

    const endDate = data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : new Date();
    const hoursUsed = roundAmount(Number(data.hoursUsed ?? 0));
    const fuelCost = roundAmount(Number(data.fuelCost ?? 0));
    const daysUsed = calculateInclusiveDays(current.startDate, endDate);
    const chargeAmount = roundAmount(daysUsed * toNumber(current.dailyRate) + hoursUsed * toNumber(current.hourlyRate) + fuelCost);

    let projectExpense: Prisma.ProjectExpenseUncheckedCreateInput | null = null;
    let createdExpense: any = null;
    if (current.projectId && chargeAmount > 0) {
      createdExpense = await tx.projectExpense.create({
        data: {
          projectId: current.projectId,
          date: endDate,
          category: 'EQUIPMENT',
          description: `تكلفة تشغيل المعدة ${current.asset.code} - ${current.asset.nameAr}`,
          amount: chargeAmount,
          reference: `EQA-${id}`
        }
      });
      await recalculateProjectActualCost(current.projectId, tx);
      projectExpense = { id: createdExpense.id } as Prisma.ProjectExpenseUncheckedCreateInput;
    }

    const allocation = await tx.equipmentAllocation.update({
      where: { id },
      data: {
        endDate,
        hoursUsed,
        fuelCost,
        chargeAmount,
        status: 'CLOSED',
        notes: data.notes ?? current.notes,
        projectExpenseId: projectExpense ? Number(projectExpense.id) : current.projectExpenseId
      },
      include: {
        asset: true,
        project: true,
        branch: true,
        projectExpense: true
      }
    });

    return { allocation, projectExpense: createdExpense };
  });

  if (result.projectExpense) {
    emitAccountingEvent('project.expense.recorded', buildProjectExpenseEventPayload(result.projectExpense));
  }
  emitAccountingEvent('equipment.allocation.closed', {
    recordId: result.allocation.id,
    assetId: result.allocation.assetId,
    projectId: result.allocation.projectId,
    chargeAmount: toNumber(result.allocation.chargeAmount),
    hoursUsed: toNumber(result.allocation.hoursUsed),
    fuelCost: toNumber(result.allocation.fuelCost)
  });

  return result.allocation;
}

export async function deleteAllocation(id: number) {
  const current = await prisma.equipmentAllocation.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('تخصيص المعدة غير موجود');
  if (current.projectExpenseId || current.status !== 'ACTIVE') {
    throw Errors.business('لا يمكن حذف تخصيص مرتبط بتكلفة مشروع أو تم إغلاقه');
  }
  await prisma.equipmentAllocation.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listMaintenance(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const projectIds = Array.isArray((query as any).projectIds) ? ((query as any).projectIds as number[]).map(Number) : [];
  const where: Prisma.MaintenanceLogWhereInput = {
    ...(query.assetId ? { assetId: Number(query.assetId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.projectId && projectIds.length ? { projectId: { in: projectIds } } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.type ? { type: String(query.type) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where,
      skip,
      take: limit,
      include: {
        asset: true,
        project: true,
        branch: true,
        supplier: true,
        projectExpense: true
      },
      orderBy: [{ serviceDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.maintenanceLog.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getMaintenance(id: number) {
  const row = await prisma.maintenanceLog.findUnique({
    where: { id },
    include: {
      asset: true,
      project: true,
      branch: true,
      supplier: true,
      projectExpense: true
    }
  });
  if (!row) throw Errors.notFound('سجل الصيانة غير موجود');
  return row;
}

export async function createMaintenance(data: {
  assetId: number;
  projectId?: number;
  branchId?: number;
  supplierId?: number;
  serviceDate?: string;
  type: string;
  cost?: number;
  description?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const asset = await ensureAssetExists(tx, Number(data.assetId));
    await ensureProjectExists(tx, data.projectId);
    await ensureBranchExists(tx, data.branchId);
    await ensureSupplierExists(tx, data.supplierId);

    const log = await tx.maintenanceLog.create({
      data: {
        assetId: Number(data.assetId),
        projectId: data.projectId ?? null,
        branchId: data.branchId ?? null,
        supplierId: data.supplierId ?? null,
        serviceDate: data.serviceDate ? parseDateOrThrow(data.serviceDate, 'serviceDate') : new Date(),
        type: data.type,
        cost: roundAmount(Number(data.cost ?? 0)),
        description: data.description ?? null,
        notes: data.notes ?? null,
        status: 'OPEN'
      }
    });

    if (asset.status === 'ACTIVE') {
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { status: 'MAINTENANCE' }
      });
    }

    return log;
  });
}

export async function updateMaintenance(
  id: number,
  data: {
    projectId?: number | null;
    branchId?: number | null;
    supplierId?: number | null;
    serviceDate?: string;
    type?: string;
    cost?: number;
    description?: string | null;
    notes?: string | null;
    status?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceLog.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الصيانة غير موجود');
    if (['COMPLETED', 'CANCELLED'].includes(String(current.status).toUpperCase())) {
      throw Errors.business('لا يمكن تعديل سجل صيانة مكتمل أو ملغي');
    }

    await ensureProjectExists(tx, data.projectId === undefined ? current.projectId : data.projectId);
    await ensureBranchExists(tx, data.branchId === undefined ? current.branchId : data.branchId);
    await ensureSupplierExists(tx, data.supplierId === undefined ? current.supplierId : data.supplierId);

    return tx.maintenanceLog.update({
      where: { id },
      data: {
        ...('projectId' in data ? { projectId: data.projectId ?? null } : {}),
        ...('branchId' in data ? { branchId: data.branchId ?? null } : {}),
        ...('supplierId' in data ? { supplierId: data.supplierId ?? null } : {}),
        ...('serviceDate' in data ? { serviceDate: parseDateOrThrow(data.serviceDate!, 'serviceDate') } : {}),
        ...('type' in data ? { type: data.type } : {}),
        ...('cost' in data ? { cost: roundAmount(Number(data.cost ?? 0)) } : {}),
        ...('description' in data ? { description: data.description ?? null } : {}),
        ...('notes' in data ? { notes: data.notes ?? null } : {}),
        ...('status' in data ? { status: data.status } : {})
      }
    });
  });
}

export async function completeMaintenance(
  id: number,
  data?: {
    completedAt?: string;
    cost?: number;
    notes?: string;
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceLog.findUnique({
      where: { id },
      include: { asset: true }
    });
    if (!current) throw Errors.notFound('سجل الصيانة غير موجود');
    if (String(current.status).toUpperCase() === 'COMPLETED') throw Errors.business('تم إكمال الصيانة مسبقاً');
    if (String(current.status).toUpperCase() === 'CANCELLED') throw Errors.business('لا يمكن إكمال سجل صيانة ملغي');

    const completedAt = data?.completedAt ? parseDateOrThrow(data.completedAt, 'completedAt') : new Date();
    const cost = roundAmount(Number(data?.cost ?? current.cost ?? 0));

    let createdExpense: any = null;
    if (current.projectId && cost > 0) {
      createdExpense = await tx.projectExpense.create({
        data: {
          projectId: current.projectId,
          date: completedAt,
          category: 'MAINTENANCE',
          description: `صيانة المعدة ${current.asset.code} - ${current.asset.nameAr}`,
          amount: cost,
          reference: `EQM-${id}`
        }
      });
      await recalculateProjectActualCost(current.projectId, tx);
    }

    const openMaintenanceCount = await tx.maintenanceLog.count({
      where: {
        assetId: current.assetId,
        id: { not: id },
        status: { in: ['OPEN', 'IN_PROGRESS'] }
      }
    });

    const maintenance = await tx.maintenanceLog.update({
      where: { id },
      data: {
        completedAt,
        cost,
        notes: data?.notes ?? current.notes,
        status: 'COMPLETED',
        projectExpenseId: createdExpense?.id ?? current.projectExpenseId
      },
      include: {
        asset: true,
        project: true,
        branch: true,
        supplier: true,
        projectExpense: true
      }
    });

    if (openMaintenanceCount === 0 && current.asset.status === 'MAINTENANCE') {
      await tx.fixedAsset.update({
        where: { id: current.assetId },
        data: { status: 'ACTIVE' }
      });
    }

    return { maintenance, projectExpense: createdExpense };
  });

  if (result.projectExpense) {
    emitAccountingEvent('project.expense.recorded', buildProjectExpenseEventPayload(result.projectExpense));
  }
  emitAccountingEvent('equipment.maintenance.completed', {
    recordId: result.maintenance.id,
    assetId: result.maintenance.assetId,
    projectId: result.maintenance.projectId,
    cost: toNumber(result.maintenance.cost),
    type: result.maintenance.type
  });

  return result.maintenance;
}

export async function deleteMaintenance(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceLog.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الصيانة غير موجود');
    if (current.projectExpenseId || String(current.status).toUpperCase() === 'COMPLETED') {
      throw Errors.business('لا يمكن حذف سجل صيانة مكتمل أو مرتبط بتكلفة مشروع');
    }

    await tx.maintenanceLog.delete({ where: { id } });

    const openMaintenanceCount = await tx.maintenanceLog.count({
      where: {
        assetId: current.assetId,
        status: { in: ['OPEN', 'IN_PROGRESS'] }
      }
    });
    if (openMaintenanceCount === 0) {
      await tx.fixedAsset.update({
        where: { id: current.assetId },
        data: { status: 'ACTIVE' }
      });
    }

    return { deleted: true, id };
  });
}
