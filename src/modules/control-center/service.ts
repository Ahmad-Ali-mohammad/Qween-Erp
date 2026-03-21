import { prisma } from '../../config/database';

function buildPage(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function parsePositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function sortByDateDesc<T extends { createdAt?: Date | null; updatedAt?: Date | null; date?: Date | null }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftDate = left.updatedAt ?? left.createdAt ?? left.date ?? new Date(0);
    const rightDate = right.updatedAt ?? right.createdAt ?? right.date ?? new Date(0);
    return rightDate.getTime() - leftDate.getTime();
  });
}

async function fetchLabelsByIds<T>(modelName: string, ids: Array<number | null | undefined>, select: Record<string, boolean>): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await (prisma as any)[modelName].findMany({
    where: { id: { in: uniqueIds } },
    select
  });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

export async function listNotifications(query: any, userId: number) {
  const page = buildPage(query);
  const where = {
    OR: [{ userId }, { userId: null }],
    ...(query.unreadOnly ? { isRead: false } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: page.skip,
      take: page.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.notification.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.max(1, Math.ceil(total / page.limit))
    }
  };
}

export async function listTasks(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.status) where.status = String(query.status);
  if (query.openOnly) where.status = { notIn: ['DONE', 'CLOSED', 'COMPLETED'] };

  const [rows, total] = await Promise.all([
    prisma.userTask.findMany({
      where,
      skip: page.skip,
      take: page.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.userTask.count({ where })
  ]);

  const userIds = Array.from(new Set(rows.map((row) => row.userId).filter((value): value is number => Number.isInteger(value))));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, fullName: true }
      })
    : [];
  const usersMap = new Map(users.map((row) => [row.id, row]));

  return {
    rows: rows.map((row) => ({
      ...row,
      assignee: row.userId ? usersMap.get(row.userId) ?? null : null
    })),
    meta: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.max(1, Math.ceil(total / page.limit))
    }
  };
}

export async function listApprovalRequests(query: any) {
  const branchId = parsePositiveInt(query.branchId);
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 50)));
  const branchFilter = branchId ? { branchId } : {};

  const [quotes, invoices, payments, contracts, purchaseOrders, tenders, ipcs, budgeting, inspections, maintenanceOrders] = await Promise.all([
    prisma.salesQuote.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.invoice.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.payment.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.contract.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.purchaseOrder.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.tender.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.subcontractIpc.findMany({
      where: { approvalStatus: 'PENDING', ...(branchId ? { subcontract: { is: { branchId } } } : {}) },
      include: { subcontract: { select: { id: true, number: true, title: true, branchId: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit
    }),
    prisma.budgetScenario.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.inspection.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.maintenanceOrder.findMany({ where: { ...branchFilter, approvalStatus: 'PENDING' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit })
  ]);

  const [projectMap, assetMap] = await Promise.all([
    fetchLabelsByIds<any>(
      'project',
      [...inspections.map((row) => row.projectId), ...maintenanceOrders.map((row) => row.projectId)],
      { id: true, code: true, nameAr: true }
    ),
    fetchLabelsByIds<any>('fixedAsset', maintenanceOrders.map((row) => row.assetId), { id: true, code: true, nameAr: true })
  ]);

  return sortByDateDesc([
    ...quotes.map((row) => ({
      id: `sales-quote-${row.id}`,
      type: 'sales-quote',
      number: row.number,
      title: row.notes || `عرض سعر ${row.number}`,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.total ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/sales-quotes'
    })),
    ...invoices.map((row) => ({
      id: `invoice-${row.id}`,
      type: 'invoice',
      number: row.number,
      title: `فاتورة ${row.type === 'PURCHASE' ? 'شراء' : 'مبيعات'}`,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.total ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: row.type === 'PURCHASE' ? '#/purchase-invoices' : '#/sales-invoices'
    })),
    ...payments.map((row) => ({
      id: `payment-${row.id}`,
      type: 'payment',
      number: row.number,
      title: `دفعة ${row.type === 'PAYMENT' ? 'صرف' : 'تحصيل'}`,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.amount ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: row.type === 'PAYMENT' ? '#/payment-vouchers' : '#/receipts'
    })),
    ...contracts.map((row) => ({
      id: `contract-${row.id}`,
      type: 'contract',
      number: row.number,
      title: row.title,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.value ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/contracts/registry'
    })),
    ...purchaseOrders.map((row) => ({
      id: `purchase-order-${row.id}`,
      type: 'purchase-order',
      number: row.number,
      title: row.notes || `أمر شراء ${row.number}`,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.total ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/purchase-orders'
    })),
    ...tenders.map((row) => ({
      id: `tender-${row.id}`,
      type: 'tender',
      number: row.number,
      title: row.title,
      contextLabel: null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.offeredValue ?? row.estimatedValue ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/tendering/tenders'
    })),
    ...ipcs.map((row) => ({
      id: `subcontract-ipc-${row.id}`,
      type: 'subcontract-ipc',
      number: row.number,
      title: row.subcontract?.title || `مستخلص ${row.number}`,
      contextLabel: row.subcontract?.number || null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.netAmount ?? row.certifiedAmount ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/subcontractors/payments'
    })),
    ...budgeting.map((row) => ({
      id: `budget-scenario-${row.id}`,
      type: 'budget-scenario',
      number: row.code,
      title: row.nameAr,
      contextLabel: String(row.fiscalYear),
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/budgeting/scenarios'
    })),
    ...inspections.map((row) => ({
      id: `inspection-${row.id}`,
      type: 'quality-inspection',
      number: row.number,
      title: row.title,
      contextLabel: row.projectId ? projectMap.get(row.projectId)?.nameAr ?? null : null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/quality/inspections'
    })),
    ...maintenanceOrders.map((row) => ({
      id: `maintenance-order-${row.id}`,
      type: 'maintenance-order',
      number: row.number,
      title: row.title,
      contextLabel: row.projectId ? projectMap.get(row.projectId)?.nameAr ?? null : row.assetId ? assetMap.get(row.assetId)?.nameAr ?? null : null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      amount: Number(row.estimatedCost ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      route: '#/systems/maintenance/orders'
    }))
  ]).slice(0, limit);
}

export async function listLiveEvents(query: any) {
  const page = buildPage(query);
  const where: any = {};
  const branchId = parsePositiveInt(query.branchId);
  if (branchId) where.branchId = branchId;
  if (query.status) where.status = String(query.status);

  const [rows, total] = await Promise.all([
    prisma.outboxEvent.findMany({
      where,
      skip: page.skip,
      take: page.limit,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.outboxEvent.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.max(1, Math.ceil(total / page.limit))
    }
  };
}
