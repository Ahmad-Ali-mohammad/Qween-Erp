import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

type AccessEntry = {
  id: number;
  canRead: boolean;
  canWrite: boolean;
};

function uniqueIds(values: Array<number | undefined | null>) {
  return [...new Set(values.filter((value): value is number => Number.isInteger(value) && Number(value) > 0))];
}

async function ensureRowsExist<T extends { id: number }>(
  label: string,
  ids: number[],
  loader: (ids: number[]) => Promise<T[]>
) {
  if (!ids.length) return;
  const rows = await loader(ids);
  if (rows.length !== ids.length) {
    throw Errors.validation(`بعض سجلات ${label} غير موجودة`);
  }
}

export async function getUserScopes(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      defaultBranchId: true,
      branchAccesses: {
        select: { branchId: true, canRead: true, canWrite: true, branch: { select: { code: true, nameAr: true } } },
        orderBy: { branchId: 'asc' }
      },
      projectAccesses: {
        select: { projectId: true, canRead: true, canWrite: true, project: { select: { code: true, nameAr: true, branchId: true } } },
        orderBy: { projectId: 'asc' }
      },
      warehouseAccesses: {
        select: { warehouseId: true, canRead: true, canWrite: true, warehouse: { select: { code: true, nameAr: true, branchId: true } } },
        orderBy: { warehouseId: 'asc' }
      }
    }
  });

  if (!user) throw Errors.notFound('المستخدم غير موجود');

  return {
    user: {
      id: user.id,
      username: user.username,
      defaultBranchId: user.defaultBranchId
    },
    branchAccesses: user.branchAccesses,
    projectAccesses: user.projectAccesses,
    warehouseAccesses: user.warehouseAccesses
  };
}

export async function replaceUserScopes(
  userId: number,
  input: {
    defaultBranchId?: number | null;
    branchAccesses?: Array<{ branchId: number } & Partial<AccessEntry>>;
    projectAccesses?: Array<{ projectId: number } & Partial<AccessEntry>>;
    warehouseAccesses?: Array<{ warehouseId: number } & Partial<AccessEntry>>;
  }
) {
  const branchIds = uniqueIds([
    input.defaultBranchId,
    ...(input.branchAccesses ?? []).map((row) => row.branchId)
  ]);
  const projectIds = uniqueIds((input.projectAccesses ?? []).map((row) => row.projectId));
  const warehouseIds = uniqueIds((input.warehouseAccesses ?? []).map((row) => row.warehouseId));

  await ensureRowsExist('الفروع', branchIds, (ids) => prisma.branch.findMany({ where: { id: { in: ids } }, select: { id: true } }));
  await ensureRowsExist('المشاريع', projectIds, (ids) => prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true } }));
  await ensureRowsExist('المستودعات', warehouseIds, (ids) => prisma.warehouse.findMany({ where: { id: { in: ids } }, select: { id: true } }));

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existingUser) throw Errors.notFound('المستخدم غير موجود');

    await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.defaultBranchId !== undefined ? { defaultBranchId: input.defaultBranchId } : {})
      }
    });

    if (input.branchAccesses) {
      await tx.userBranchAccess.deleteMany({ where: { userId } });
      if (input.branchAccesses.length) {
        await tx.userBranchAccess.createMany({
          data: input.branchAccesses.map((row) => ({
            userId,
            branchId: row.branchId,
            canRead: row.canRead ?? true,
            canWrite: row.canWrite ?? false
          }))
        });
      }
    }

    if (input.projectAccesses) {
      await tx.userProjectAccess.deleteMany({ where: { userId } });
      if (input.projectAccesses.length) {
        const projects = await tx.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, branchId: true }
        });
        const projectBranchById = new Map(projects.map((row) => [row.id, row.branchId]));
        await tx.userProjectAccess.createMany({
          data: input.projectAccesses.map((row) => ({
            userId,
            projectId: row.projectId,
            branchId: projectBranchById.get(row.projectId) ?? null,
            canRead: row.canRead ?? true,
            canWrite: row.canWrite ?? false
          }))
        });
      }
    }

    if (input.warehouseAccesses) {
      await tx.userWarehouseAccess.deleteMany({ where: { userId } });
      if (input.warehouseAccesses.length) {
        await tx.userWarehouseAccess.createMany({
          data: input.warehouseAccesses.map((row) => ({
            userId,
            warehouseId: row.warehouseId,
            canRead: row.canRead ?? true,
            canWrite: row.canWrite ?? false
          }))
        });
      }
    }
  });

  return getUserScopes(userId);
}
