import { qw } from '../../utils/where';
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
  return prisma.orm.public.Branch.orderBy([(r) => r.isActive.desc(), (r) => r.code.asc()]).all();
}

export async function getBranch(id: number) {
  const branch = await prisma.orm.public.Branch.first({ id });
  if (!branch) throw Errors.notFound('الفرع غير موجود');
  return branch;
}

export async function createBranch(data: any) {
  return prisma.orm.public.Branch.create(data);
}

export async function updateBranch(id: number, data: any) {
  await getBranch(id);
  return prisma.orm.public.Branch.where((r) => qw(r, { id })).update(data).then((r0) => r0!);
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
    const deactivated = await prisma.orm.public.Branch.where((r) => qw(r, { id })).update({ isActive: false }).then((r0) => r0!);
    return { ...deactivated, deactivated: true };
  }

  await prisma.orm.public.Branch.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  return { deleted: true, id };
}

export async function listApprovalWorkflows(query: any) {
  const where: Record<string, unknown> = {};
  if (query.entityType) where.entityType = String(query.entityType);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.isActive !== undefined) where.isActive = String(query.isActive).toLowerCase() === 'true';

  return prisma.orm.public.ApprovalWorkflow.where((r) => qw(r, where)).orderBy([(r) => r.entityType.asc(), (r) => r.code.asc()]).all();
}

export async function getApprovalWorkflow(id: number) {
  const workflow = await prisma.orm.public.ApprovalWorkflow.first({ id });
  if (!workflow) throw Errors.notFound('مسار الموافقة غير موجود');
  return workflow;
}

export async function createApprovalWorkflow(data: any) {
  return prisma.orm.public.ApprovalWorkflow.create(data);
}

export async function updateApprovalWorkflow(id: number, data: any) {
  await getApprovalWorkflow(id);
  return prisma.orm.public.ApprovalWorkflow.where((r) => qw(r, { id })).update(data).then((r0) => r0!);
}

export async function deleteApprovalWorkflow(id: number) {
  await getApprovalWorkflow(id);
  await prisma.orm.public.ApprovalWorkflow.where((r) => qw(r, { id })).delete().then((r0) => r0!);
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
    prisma.orm.public.OutboxEvent.where((r) => qw(r, where)).orderBy([(r) => r.createdAt.desc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.OutboxEvent.where((r) => qw(r, where)).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
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
  const event = await prisma.orm.public.OutboxEvent.include('consumptions').first({ id });
  if (!event) throw Errors.notFound('حدث الـ outbox غير موجود');
  return event;
}

export async function retryFailedOutboxEvent(id: number) {
  const event = await prisma.orm.public.OutboxEvent.first({ id });
  if (!event) throw Errors.notFound('حدث الـ outbox غير موجود');
  return retryOutboxEvent(id);
}
