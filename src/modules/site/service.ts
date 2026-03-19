import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { recordInventoryMovement } from '../inventory/service';
import { reserveNextSequenceInDb } from '../numbering/service';

type SiteDb = Prisma.TransactionClient | typeof prisma;

type ScopeFilter = {
  branchIds?: number[];
  projectIds?: number[];
  warehouseIds?: number[];
};

type MaterialLineInput = {
  itemId: number;
  quantity: number;
  estimatedUnitCost?: number;
  notes?: string;
};

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function toNumber(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(value ?? 0);
}

function round3(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

async function ensureBranchExists(db: SiteDb, branchId?: number | null) {
  if (!branchId) return null;
  const branch = await db.branch.findUnique({ where: { id: Number(branchId) } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
  return branch;
}

async function ensureSiteExists(db: SiteDb, siteId?: number | null) {
  if (!siteId) return null;
  const site = await db.site.findUnique({ where: { id: Number(siteId) } });
  if (!site) throw Errors.validation('الموقع غير موجود');
  return site;
}

async function ensureProjectExists(db: SiteDb, projectId: number) {
  const project = await db.project.findUnique({ where: { id: Number(projectId) } });
  if (!project) throw Errors.validation('المشروع غير موجود');
  return project;
}

async function ensureWarehouseExists(db: SiteDb, warehouseId?: number | null) {
  if (!warehouseId) return null;
  const warehouse = await db.warehouse.findUnique({ where: { id: Number(warehouseId) } });
  if (!warehouse) throw Errors.validation('المستودع غير موجود');
  return warehouse;
}

async function ensureAssetExists(db: SiteDb, assetId: number) {
  const asset = await db.fixedAsset.findUnique({ where: { id: Number(assetId) } });
  if (!asset) throw Errors.validation('المعدة أو الأصل غير موجود');
  return asset;
}

async function ensurePhaseAndTask(
  db: SiteDb,
  data: { projectId: number; phaseId?: number | null; taskId?: number | null }
) {
  const [phase, task] = await Promise.all([
    data.phaseId ? db.projectPhase.findUnique({ where: { id: Number(data.phaseId) } }) : Promise.resolve(null),
    data.taskId ? db.projectTask.findUnique({ where: { id: Number(data.taskId) } }) : Promise.resolve(null)
  ]);

  if (data.phaseId && (!phase || phase.projectId !== Number(data.projectId))) {
    throw Errors.validation('المرحلة غير مرتبطة بالمشروع المحدد');
  }
  if (data.taskId && (!task || task.projectId !== Number(data.projectId))) {
    throw Errors.validation('المهمة غير مرتبطة بالمشروع المحدد');
  }
  if (task && data.phaseId && task.phaseId && task.phaseId !== Number(data.phaseId)) {
    throw Errors.validation('المهمة لا تتبع المرحلة المحددة');
  }

  return { phase, task };
}

async function ensureSiteContext(
  db: SiteDb,
  data: { branchId?: number | null; siteId?: number | null; projectId: number; warehouseId?: number | null }
) {
  const [branch, site, project, warehouse] = await Promise.all([
    ensureBranchExists(db, data.branchId),
    ensureSiteExists(db, data.siteId),
    ensureProjectExists(db, data.projectId),
    ensureWarehouseExists(db, data.warehouseId)
  ]);

  const branchId = Number(data.branchId ?? project.branchId ?? site?.branchId ?? warehouse?.branchId ?? 0) || null;
  const siteId = Number(data.siteId ?? project.siteId ?? warehouse?.siteId ?? 0) || null;

  if (branch && project.branchId && branch.id !== project.branchId) {
    throw Errors.validation('المشروع لا يتبع الفرع المحدد');
  }
  if (site && site.branchId !== Number(branchId ?? site.branchId)) {
    throw Errors.validation('الموقع لا يتبع الفرع المحدد');
  }
  if (site && project.siteId && site.id !== project.siteId) {
    throw Errors.validation('الموقع لا يتبع المشروع المحدد');
  }
  if (warehouse && branchId && warehouse.branchId && warehouse.branchId !== Number(branchId)) {
    throw Errors.validation('المستودع لا يتبع الفرع المحدد');
  }
  if (warehouse && siteId && warehouse.siteId && warehouse.siteId !== Number(siteId)) {
    throw Errors.validation('المستودع لا يتبع الموقع المحدد');
  }

  return { branchId, siteId, project, warehouse };
}

async function normalizeMaterialLines(db: SiteDb, lines: MaterialLineInput[]) {
  if (!Array.isArray(lines) || !lines.length) {
    throw Errors.validation('يجب إدخال بنود طلب المواد');
  }

  const itemIds = lines.map((line) => Number(line.itemId));
  const items = await db.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, purchasePrice: true }
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  return lines.map((line, index) => {
    const itemId = Number(line.itemId);
    const item = itemMap.get(itemId);
    if (!item) throw Errors.validation(`الصنف في السطر ${index + 1} غير موجود`);

    const quantity = round3(Number(line.quantity ?? 0));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw Errors.validation(`كمية السطر ${index + 1} غير صالحة`);
    }

    return {
      itemId,
      quantity,
      estimatedUnitCost: round3(Number(line.estimatedUnitCost ?? item.purchasePrice ?? 0)),
      notes: line.notes?.trim() || null
    };
  });
}

export async function getReferenceData(scope?: ScopeFilter) {
  const branchFilter = scope?.branchIds?.length ? { id: { in: scope.branchIds.map(Number) } } : {};
  const projectFilter = scope?.projectIds?.length ? { id: { in: scope.projectIds.map(Number) } } : {};
  const warehouseFilter = scope?.warehouseIds?.length ? { id: { in: scope.warehouseIds.map(Number) } } : {};

  const [sites, projects, warehouses, items, assets, tasks] = await Promise.all([
    prisma.site.findMany({
      where: {
        isActive: true,
        ...(scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {})
      },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }]
    }),
    prisma.project.findMany({
      where: {
        isActive: true,
        ...projectFilter
      },
      select: { id: true, code: true, nameAr: true, branchId: true, siteId: true, status: true },
      orderBy: [{ code: 'asc' }]
    }),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(Object.keys(warehouseFilter).length
          ? warehouseFilter
          : scope?.branchIds?.length
            ? { branchId: { in: scope.branchIds.map(Number) } }
            : {})
      },
      select: { id: true, code: true, nameAr: true, branchId: true, siteId: true },
      orderBy: [{ code: 'asc' }]
    }),
    prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameAr: true, purchasePrice: true, onHandQty: true },
      orderBy: [{ code: 'asc' }],
      take: 200
    }),
    prisma.fixedAsset.findMany({
      where: { status: { in: ['ACTIVE', 'MAINTENANCE'] } },
      select: { id: true, code: true, nameAr: true, status: true },
      orderBy: [{ code: 'asc' }],
      take: 200
    }),
    prisma.projectTask.findMany({
      where: {
        ...(scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {})
      },
      select: { id: true, projectId: true, title: true, status: true, progress: true },
      orderBy: [{ id: 'desc' }],
      take: 200
    })
  ]);

  return {
    branches: await prisma.branch.findMany({
      where: { isActive: true, ...branchFilter },
      select: { id: true, code: true, nameAr: true },
      orderBy: [{ code: 'asc' }]
    }),
    sites,
    projects,
    warehouses,
    items,
    assets,
    tasks
  };
}

export async function listDailyLogs(query: Record<string, unknown>, scope?: ScopeFilter) {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SiteDailyLogWhereInput = {
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.siteId ? { siteId: Number(query.siteId) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          logDate: {
            ...(query.dateFrom ? { gte: parseDateOrThrow(String(query.dateFrom), 'dateFrom') } : {}),
            ...(query.dateTo ? { lte: parseDateOrThrow(String(query.dateTo), 'dateTo') } : {})
          }
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.siteDailyLog.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ logDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteDailyLog.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getDailyLog(id: number) {
  const row = await prisma.siteDailyLog.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      site: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } }
    }
  });
  if (!row) throw Errors.notFound('اليومية الميدانية غير موجودة');
  return row;
}

export async function createDailyLog(data: {
  branchId?: number;
  siteId?: number;
  projectId: number;
  logDate?: string;
  weather?: string;
  manpowerCount?: number;
  equipmentCount?: number;
  progressSummary?: string;
  issues?: string;
  notes?: string;
  createdById?: number;
}) {
  const row = await prisma.$transaction(async (tx) => {
    const context = await ensureSiteContext(tx, data);
    return tx.siteDailyLog.create({
      data: {
        branchId: context.branchId,
        siteId: context.siteId,
        projectId: Number(data.projectId),
        logDate: data.logDate ? parseDateOrThrow(data.logDate, 'logDate') : new Date(),
        weather: data.weather?.trim() || null,
        manpowerCount: Number(data.manpowerCount ?? 0),
        equipmentCount: Number(data.equipmentCount ?? 0),
        progressSummary: data.progressSummary?.trim() || null,
        issues: data.issues?.trim() || null,
        notes: data.notes?.trim() || null,
        createdById: data.createdById ?? null
      },
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } }
      }
    });
  });

  emitAccountingEvent('site.daily_log.recorded', {
    recordId: row.id,
    branchId: row.branchId,
    siteId: row.siteId,
    projectId: row.projectId,
    logDate: row.logDate.toISOString(),
    manpowerCount: row.manpowerCount,
    equipmentCount: row.equipmentCount
  });

  return row;
}

export async function listMaterialRequests(query: Record<string, unknown>, scope?: ScopeFilter) {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SiteMaterialRequestWhereInput = {
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.siteId ? { siteId: Number(query.siteId) } : {}),
    ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(!query.warehouseId && scope?.warehouseIds?.length ? { warehouseId: { in: scope.warehouseIds.map(Number) } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.siteMaterialRequest.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        warehouse: { select: { id: true, code: true, nameAr: true } },
        lines: {
          include: {
            item: { select: { id: true, code: true, nameAr: true, purchasePrice: true } }
          },
          orderBy: { id: 'asc' }
        }
      },
      orderBy: [{ requestDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteMaterialRequest.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getMaterialRequest(id: number) {
  const row = await prisma.siteMaterialRequest.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      site: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      warehouse: { select: { id: true, code: true, nameAr: true } },
      lines: {
        include: {
          item: { select: { id: true, code: true, nameAr: true, purchasePrice: true } }
        },
        orderBy: { id: 'asc' }
      }
    }
  });
  if (!row) throw Errors.notFound('طلب المواد غير موجود');
  return row;
}

export async function createMaterialRequest(data: {
  branchId?: number;
  siteId?: number;
  projectId: number;
  warehouseId?: number;
  requestDate?: string;
  neededBy?: string;
  notes?: string;
  requestedById?: number;
  lines: MaterialLineInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const context = await ensureSiteContext(tx, data);
    const lines = await normalizeMaterialLines(tx, data.lines);
    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'SMR',
      branchId: context.branchId,
      date: data.requestDate
    });

    return tx.siteMaterialRequest.create({
      data: {
        number: sequence.number,
        branchId: context.branchId,
        siteId: context.siteId,
        projectId: Number(data.projectId),
        warehouseId: context.warehouse?.id ?? null,
        requestDate: data.requestDate ? parseDateOrThrow(data.requestDate, 'requestDate') : new Date(),
        neededBy: data.neededBy ? parseDateOrThrow(data.neededBy, 'neededBy') : null,
        status: 'DRAFT',
        notes: data.notes?.trim() || null,
        requestedById: data.requestedById ?? null,
        lines: {
          create: lines
        }
      },
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        warehouse: { select: { id: true, code: true, nameAr: true } },
        lines: {
          include: {
            item: { select: { id: true, code: true, nameAr: true, purchasePrice: true } }
          },
          orderBy: { id: 'asc' }
        }
      }
    });
  });
}

export async function submitMaterialRequest(id: number) {
  const row = await prisma.siteMaterialRequest.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('طلب المواد غير موجود');
  if (row.status !== 'DRAFT') throw Errors.business('يمكن إرسال طلب المواد من حالة المسودة فقط');
  return prisma.siteMaterialRequest.update({
    where: { id },
    data: { status: 'SUBMITTED' }
  });
}

export async function approveMaterialRequest(id: number, approvedById?: number) {
  const row = await prisma.siteMaterialRequest.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('طلب المواد غير موجود');
  if (!['DRAFT', 'SUBMITTED'].includes(String(row.status).toUpperCase())) {
    throw Errors.business('لا يمكن اعتماد طلب المواد من حالته الحالية');
  }
  return prisma.siteMaterialRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: approvedById ?? row.approvedById,
      approvedAt: new Date()
    }
  });
}

export async function fulfillMaterialRequest(
  id: number,
  data?: { warehouseId?: number; fulfilledAt?: string }
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.siteMaterialRequest.findUnique({
      where: { id },
      include: {
        lines: true
      }
    });
    if (!current) throw Errors.notFound('طلب المواد غير موجود');
    if (String(current.status).toUpperCase() !== 'APPROVED') {
      throw Errors.business('يجب اعتماد طلب المواد قبل صرفه');
    }

    const context = await ensureSiteContext(tx, {
      branchId: current.branchId ?? undefined,
      siteId: current.siteId ?? undefined,
      projectId: current.projectId,
      warehouseId: data?.warehouseId ?? current.warehouseId ?? undefined
    });

    if (!context.warehouse?.id) throw Errors.validation('يجب تحديد مستودع لصرف المواد');
    const movementDate = data?.fulfilledAt ? parseDateOrThrow(data.fulfilledAt, 'fulfilledAt') : new Date();
    const movements = [] as Array<Awaited<ReturnType<typeof recordInventoryMovement>>['movement']>;

    for (const line of current.lines) {
      const movementResult = await recordInventoryMovement(tx, {
        date: movementDate,
        type: 'SITE_ISSUE',
        reference: current.number,
        itemId: line.itemId,
        branchId: context.branchId ?? undefined,
        projectId: current.projectId,
        warehouseId: context.warehouse.id,
        quantity: -toNumber(line.quantity),
        unitCost: toNumber(line.estimatedUnitCost),
        totalCost: toNumber(line.quantity) * toNumber(line.estimatedUnitCost),
        notes: current.notes ?? undefined
      });
      movements.push(movementResult.movement);

      await tx.siteMaterialRequestLine.update({
        where: { id: line.id },
        data: {
          issuedQuantity: line.quantity
        }
      });
    }

    const request = await tx.siteMaterialRequest.update({
      where: { id },
      data: {
        warehouseId: context.warehouse.id,
        status: 'FULFILLED',
        fulfilledAt: movementDate
      },
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        warehouse: { select: { id: true, code: true, nameAr: true } },
        lines: {
          include: {
            item: { select: { id: true, code: true, nameAr: true, purchasePrice: true } }
          },
          orderBy: { id: 'asc' }
        }
      }
    });

    return { request, movements };
  });

  for (const movement of result.movements) {
    emitAccountingEvent('inventory.movement.recorded', {
      recordId: movement.id,
      itemId: movement.itemId,
      branchId: movement.branchId,
      projectId: movement.projectId,
      warehouseId: movement.warehouseId,
      locationId: movement.locationId,
      quantity: toNumber(movement.quantity),
      totalCost: toNumber(movement.totalCost),
      type: movement.type,
      reference: movement.reference
    });
  }

  emitAccountingEvent('site.material_request.fulfilled', {
    recordId: result.request.id,
    branchId: result.request.branchId,
    siteId: result.request.siteId,
    projectId: result.request.projectId,
    warehouseId: result.request.warehouseId,
    lineCount: result.request.lines.length
  });

  return result.request;
}

export async function listProgressEntries(query: Record<string, unknown>, scope?: ScopeFilter) {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SiteProgressEntryWhereInput = {
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.siteId ? { siteId: Number(query.siteId) } : {}),
    ...(query.taskId ? { taskId: Number(query.taskId) } : {}),
    ...(query.phaseId ? { phaseId: Number(query.phaseId) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.siteProgressEntry.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        phase: { select: { id: true, nameAr: true, sequence: true } },
        task: { select: { id: true, title: true, status: true, progress: true } }
      },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteProgressEntry.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function createProgressEntry(data: {
  branchId?: number;
  siteId?: number;
  projectId: number;
  phaseId?: number;
  taskId?: number;
  entryDate?: string;
  progressPercent: number;
  quantityCompleted?: number;
  description?: string;
  notes?: string;
  createdById?: number;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const context = await ensureSiteContext(tx, data);
    const { task } = await ensurePhaseAndTask(tx, {
      projectId: data.projectId,
      phaseId: data.phaseId,
      taskId: data.taskId
    });

    const progressPercent = round3(Number(data.progressPercent ?? 0));
    if (progressPercent < 0 || progressPercent > 100) {
      throw Errors.validation('نسبة الإنجاز يجب أن تكون بين 0 و100');
    }

    const row = await tx.siteProgressEntry.create({
      data: {
        branchId: context.branchId,
        siteId: context.siteId,
        projectId: Number(data.projectId),
        phaseId: data.phaseId ?? null,
        taskId: data.taskId ?? null,
        entryDate: data.entryDate ? parseDateOrThrow(data.entryDate, 'entryDate') : new Date(),
        progressPercent,
        quantityCompleted: round3(Number(data.quantityCompleted ?? 0)),
        description: data.description?.trim() || null,
        notes: data.notes?.trim() || null,
        createdById: data.createdById ?? null
      },
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        phase: { select: { id: true, nameAr: true, sequence: true } },
        task: { select: { id: true, title: true, status: true, progress: true } }
      }
    });

    if (task) {
      await tx.projectTask.update({
        where: { id: task.id },
        data: {
          progress: Math.round(progressPercent),
          status: progressPercent >= 100 ? 'DONE' : progressPercent > 0 ? 'IN_PROGRESS' : task.status
        }
      });
    }

    return row;
  });

  emitAccountingEvent('site.progress.recorded', {
    recordId: result.id,
    branchId: result.branchId,
    siteId: result.siteId,
    projectId: result.projectId,
    phaseId: result.phaseId,
    taskId: result.taskId,
    progressPercent: toNumber(result.progressPercent)
  });

  return result;
}

export async function listEquipmentIssues(query: Record<string, unknown>, scope?: ScopeFilter) {
  const { page, limit, skip } = paginate(query);
  const where: Prisma.SiteEquipmentIssueWhereInput = {
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.siteId ? { siteId: Number(query.siteId) } : {}),
    ...(query.assetId ? { assetId: Number(query.assetId) } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.siteEquipmentIssue.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        asset: { select: { id: true, code: true, nameAr: true, status: true } },
        maintenanceLog: { select: { id: true, type: true, status: true, serviceDate: true } }
      },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteEquipmentIssue.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getEquipmentIssue(id: number) {
  const row = await prisma.siteEquipmentIssue.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      site: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      asset: { select: { id: true, code: true, nameAr: true, status: true } },
      maintenanceLog: { select: { id: true, type: true, status: true, serviceDate: true } }
    }
  });
  if (!row) throw Errors.notFound('بلاغ المعدة غير موجود');
  return row;
}

export async function createEquipmentIssue(data: {
  branchId?: number;
  siteId?: number;
  projectId?: number;
  assetId: number;
  issueDate?: string;
  severity?: string;
  title: string;
  description?: string;
  reportedById?: number;
  createMaintenance?: boolean;
}) {
  const row = await prisma.$transaction(async (tx) => {
    const asset = await ensureAssetExists(tx, data.assetId);
    const project = data.projectId ? await ensureProjectExists(tx, data.projectId) : null;
    const branch = await ensureBranchExists(tx, data.branchId ?? project?.branchId ?? undefined);
    const site = await ensureSiteExists(tx, data.siteId ?? project?.siteId ?? undefined);

    if (branch && project?.branchId && branch.id !== project.branchId) {
      throw Errors.validation('المشروع لا يتبع الفرع المحدد');
    }
    if (site && project?.siteId && site.id !== project.siteId) {
      throw Errors.validation('الموقع لا يتبع المشروع المحدد');
    }

    let maintenanceLogId: number | null = null;
    if (data.createMaintenance) {
      const maintenance = await tx.maintenanceLog.create({
        data: {
          assetId: asset.id,
          projectId: project?.id ?? null,
          branchId: branch?.id ?? project?.branchId ?? null,
          serviceDate: data.issueDate ? parseDateOrThrow(data.issueDate, 'issueDate') : new Date(),
          type: 'CORRECTIVE',
          status: 'OPEN',
          description: `${data.title}${data.description ? ` - ${data.description}` : ''}`,
          notes: 'Created from site equipment issue'
        }
      });
      maintenanceLogId = maintenance.id;

      if (asset.status === 'ACTIVE') {
        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: { status: 'MAINTENANCE' }
        });
      }
    }

    return tx.siteEquipmentIssue.create({
      data: {
        branchId: branch?.id ?? project?.branchId ?? null,
        siteId: site?.id ?? project?.siteId ?? null,
        projectId: project?.id ?? null,
        assetId: asset.id,
        maintenanceLogId,
        issueDate: data.issueDate ? parseDateOrThrow(data.issueDate, 'issueDate') : new Date(),
        severity: data.severity?.trim() || 'MEDIUM',
        status: maintenanceLogId ? 'ESCALATED' : 'OPEN',
        title: data.title.trim(),
        description: data.description?.trim() || null,
        reportedById: data.reportedById ?? null
      },
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        site: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        asset: { select: { id: true, code: true, nameAr: true, status: true } },
        maintenanceLog: { select: { id: true, type: true, status: true, serviceDate: true } }
      }
    });
  });

  emitAccountingEvent('site.equipment_issue.reported', {
    recordId: row.id,
    branchId: row.branchId,
    siteId: row.siteId,
    projectId: row.projectId,
    assetId: row.assetId,
    maintenanceLogId: row.maintenanceLogId
  });

  return row;
}

export async function resolveEquipmentIssue(id: number, data?: { resolutionNotes?: string }) {
  const row = await prisma.siteEquipmentIssue.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('بلاغ المعدة غير موجود');
  if (String(row.status).toUpperCase() === 'RESOLVED') {
    throw Errors.business('تمت معالجة بلاغ المعدة مسبقاً');
  }

  return prisma.siteEquipmentIssue.update({
    where: { id },
    data: {
      status: 'RESOLVED',
      resolutionNotes: data?.resolutionNotes?.trim() || row.resolutionNotes,
      resolvedAt: new Date()
    }
  });
}
