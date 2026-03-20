import { prisma } from '../../config/database';
import { retryOutboxEvent } from '../../platform/events/outbox';
import { Errors } from '../../utils/response';

const BRANCH_REFERENCE_RELATIONS = {
  customers: true,
  suppliers: true,
  invoices: true,
  payments: true,
  projects: true,
  employees: true,
  contracts: true,
  salesQuotes: true,
  purchaseOrders: true,
  fixedAssets: true,
  warehouses: true
} as const;

export async function listBranches() {
  return prisma.branch.findMany({
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }]
  });
}

export async function getBranch(id: number) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw Errors.notFound('الفرع غير موجود');
  return branch;
}

export async function createBranch(data: any) {
  return prisma.branch.create({ data });
}

export async function updateBranch(id: number, data: any) {
  await getBranch(id);
  return prisma.branch.update({
    where: { id },
    data
  });
}

export async function deleteBranch(id: number) {
  const branch = await prisma.branch.findUnique({
    where: { id },
    include: {
      _count: { select: BRANCH_REFERENCE_RELATIONS }
    }
  });

  if (!branch) throw Errors.notFound('الفرع غير موجود');

  const relationCount = Object.values(branch._count).reduce((sum, value) => sum + Number(value), 0);
  if (relationCount > 0) {
    const deactivated = await prisma.branch.update({
      where: { id },
      data: { isActive: false }
    });
    return { ...deactivated, deactivated: true };
  }

  await prisma.branch.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listApprovalWorkflows(query: any) {
  const where: Record<string, unknown> = {};
  if (query.entityType) where.entityType = String(query.entityType);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.isActive !== undefined) where.isActive = String(query.isActive).toLowerCase() === 'true';

  return prisma.approvalWorkflow.findMany({
    where,
    orderBy: [{ entityType: 'asc' }, { code: 'asc' }]
  });
}

export async function getApprovalWorkflow(id: number) {
  const workflow = await prisma.approvalWorkflow.findUnique({ where: { id } });
  if (!workflow) throw Errors.notFound('مسار الموافقة غير موجود');
  return workflow;
}

export async function createApprovalWorkflow(data: any) {
  return prisma.approvalWorkflow.create({ data });
}

export async function updateApprovalWorkflow(id: number, data: any) {
  await getApprovalWorkflow(id);
  return prisma.approvalWorkflow.update({
    where: { id },
    data
  });
}

export async function deleteApprovalWorkflow(id: number) {
  await getApprovalWorkflow(id);
  await prisma.approvalWorkflow.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listOutboxEvents(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (query.status) where.status = String(query.status);
  if (query.eventType) where.eventType = { contains: String(query.eventType), mode: 'insensitive' };
  if (query.aggregateType) where.aggregateType = String(query.aggregateType);
  if (query.branchId) where.branchId = Number(query.branchId);

  const [rows, total] = await Promise.all([
    prisma.outboxEvent.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }]
    }),
    prisma.outboxEvent.count({ where })
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

export async function getOutboxEvent(id: number) {
  const event = await prisma.outboxEvent.findUnique({
    where: { id },
    include: { consumptions: true }
  });
  if (!event) throw Errors.notFound('حدث الـ outbox غير موجود');
  return event;
}

export async function retryFailedOutboxEvent(id: number) {
  const event = await prisma.outboxEvent.findUnique({ where: { id } });
  if (!event) throw Errors.notFound('حدث الـ outbox غير موجود');
  return retryOutboxEvent(id);
}
