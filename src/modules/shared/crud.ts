import { prisma } from '../../config/database';
import { normalizePagination } from '../../types/pagination';

export async function listModel(model: string, query: Record<string, unknown>) {
  const delegate = (prisma as any)[model];
  const pagination = normalizePagination({
    page: Number(query.page ?? 1),
    limit: Number(query.limit ?? 20)
  });
  const skip = (pagination.page - 1) * pagination.limit;

  const [rows, total] = await Promise.all([
    delegate.findMany({ skip, take: pagination.limit, orderBy: { id: 'desc' } }),
    delegate.count()
  ]);

  return {
    rows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pagination.limit))
    }
  };
}

export async function getById(model: string, id: number) {
  const delegate = (prisma as any)[model];
  return delegate.findUnique({ where: { id } });
}

export async function createOne(model: string, data: Record<string, unknown>) {
  const delegate = (prisma as any)[model];
  return delegate.create({ data });
}

export async function updateOne(model: string, id: number, data: Record<string, unknown>) {
  const delegate = (prisma as any)[model];
  return delegate.update({ where: { id }, data });
}

export async function deleteOne(model: string, id: number) {
  const delegate = (prisma as any)[model];
  return delegate.delete({ where: { id } });
}
