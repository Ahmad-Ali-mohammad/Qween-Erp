import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

type TreeNode = {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: string;
  parentId: number | null;
  level: number;
  isControl: boolean;
  allowPosting: boolean;
  isActive: boolean;
  own: {
    debit: number;
    credit: number;
    closingBalance: number;
  };
  aggregate: {
    debit: number;
    credit: number;
    closingBalance: number;
  };
  children: TreeNode[];
};

async function ensureAccountExists(id: number) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) throw Errors.notFound('الحساب غير موجود');
  return account;
}

async function ensureParentRules(childType: string, parentId: number | null) {
  if (!parentId) return null;

  const parent = await prisma.account.findUnique({ where: { id: parentId } });
  if (!parent) throw Errors.notFound('الحساب الأب غير موجود');
  if (!parent.isActive) throw Errors.business('الحساب الأب غير نشط');
  if (parent.type !== (childType as any)) {
    throw Errors.business('نوع الحساب الفرعي يجب أن يطابق نوع الحساب الأب');
  }

  return parent;
}

async function isDescendant(candidateParentId: number, childId: number): Promise<boolean> {
  let currentId: number | null = candidateParentId;

  while (currentId) {
    if (currentId === childId) return true;
    const current: { parentId: number | null } | null = await prisma.account.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });
    currentId = current?.parentId ?? null;
  }

  return false;
}

async function recalculateSubtreeLevels(rootId: number): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [{ id: rootId }, { parentId: rootId }]
    },
    select: { id: true, parentId: true, level: true }
  });

  const all = new Map<number, { id: number; parentId: number | null; level: number }>();
  for (const acc of accounts) all.set(acc.id, acc);

  const queue: number[] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const node = all.get(id) ?? (await prisma.account.findUnique({ where: { id }, select: { id: true, parentId: true, level: true } }));
    if (!node) continue;

    const parentLevel = node.parentId
      ? (await prisma.account.findUnique({ where: { id: node.parentId }, select: { level: true } }))?.level ?? 0
      : 0;
    const newLevel = parentLevel + 1;

    if (node.level !== newLevel) {
      await prisma.account.update({ where: { id: node.id }, data: { level: newLevel } });
      node.level = newLevel;
      all.set(node.id, node);
    }

    const children = await prisma.account.findMany({ where: { parentId: id }, select: { id: true } });
    for (const child of children) queue.push(child.id);
  }
}

export async function createAccount(data: any) {
  const exists = await prisma.account.findUnique({ where: { code: data.code } });
  if (exists) throw Errors.conflict('رمز الحساب موجود بالفعل');

  const parent = await ensureParentRules(data.type, data.parentId ?? null);
  const level = parent ? parent.level + 1 : 1;

  const account = await prisma.account.create({
    data: {
      ...data,
      level,
      parentId: parent?.id,
      isControl: data.isControl ?? false,
      allowPosting: data.allowPosting ?? true,
      normalBalance:
        data.normalBalance ??
        (data.type === 'ASSET' || data.type === 'EXPENSE' ? 'Debit' : 'Credit')
    }
  });

  if (parent && parent.allowPosting) {
    await prisma.account.update({
      where: { id: parent.id },
      data: { allowPosting: false, isControl: true }
    });
  }

  return account;
}

export async function updateAccount(id: number, data: any) {
  const current = await ensureAccountExists(id);

  const nextType = data.type ?? current.type;
  const nextParentId = data.parentId !== undefined ? data.parentId : current.parentId;

  if (nextParentId) {
    if (nextParentId === id) throw Errors.business('لا يمكن جعل الحساب أبًا لنفسه');
    if (await isDescendant(nextParentId, id)) {
      throw Errors.business('لا يمكن نقل الحساب داخل أحد فروعه (منع الدورة)');
    }
  }

  const parent = await ensureParentRules(nextType, nextParentId ?? null);
  const level = parent ? parent.level + 1 : 1;

  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...data,
      parentId: parent?.id ?? null,
      level
    }
  });

  if (data.parentId !== undefined) {
    await recalculateSubtreeLevels(id);
  }

  return updated;
}

export async function moveAccount(id: number, newParentId: number | null) {
  const account = await ensureAccountExists(id);

  if (newParentId === id) throw Errors.business('لا يمكن نقل الحساب تحت نفسه');
  if (newParentId && (await isDescendant(newParentId, id))) {
    throw Errors.business('لا يمكن نقل الحساب إلى عقدة ضمن شجرته الحالية');
  }

  const parent = await ensureParentRules(account.type, newParentId);

  const moved = await prisma.account.update({
    where: { id },
    data: {
      parentId: parent?.id ?? null,
      level: parent ? parent.level + 1 : 1
    }
  });

  await recalculateSubtreeLevels(moved.id);
  return moved;
}

export async function togglePosting(id: number, allowPosting: boolean) {
  const account = await ensureAccountExists(id);
  const childrenCount = await prisma.account.count({ where: { parentId: id } });

  if (allowPosting && childrenCount > 0) {
    throw Errors.business('الحساب الأب لا يمكن أن يكون قابلًا للترحيل طالما لديه أبناء');
  }

  return prisma.account.update({
    where: { id: account.id },
    data: {
      allowPosting,
      isControl: !allowPosting || childrenCount > 0
    }
  });
}

async function getLatestBalancesMap(fiscalYear?: number, period?: number): Promise<Map<number, { debit: number; credit: number; closingBalance: number }>> {
  const map = new Map<number, { debit: number; credit: number; closingBalance: number }>();

  const balances = await prisma.accountBalance.findMany({
    where: {
      ...(fiscalYear ? { fiscalYear } : {}),
      ...(period ? { period } : {})
    },
    orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }]
  });

  for (const b of balances) {
    if (map.has(b.accountId)) continue;
    map.set(b.accountId, {
      debit: Number(b.debit),
      credit: Number(b.credit),
      closingBalance: Number(b.closingBalance)
    });
  }

  return map;
}

export async function getTree(options?: { includeInactive?: boolean; fiscalYear?: number; period?: number }) {
  const includeInactive = options?.includeInactive ?? false;
  const accounts = await prisma.account.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { code: 'asc' }
  });

  const balanceMap = await getLatestBalancesMap(options?.fiscalYear, options?.period);

  const byParent = new Map<number | null, any[]>();
  for (const acc of accounts) {
    const key = acc.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(acc);
  }

  const build = (parentId: number | null): TreeNode[] => {
    const current = (byParent.get(parentId) ?? []).map((acc) => {
      const own = balanceMap.get(acc.id) ?? { debit: 0, credit: 0, closingBalance: 0 };
      const node: TreeNode = {
        id: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
        parentId: acc.parentId,
        level: acc.level,
        isControl: acc.isControl,
        allowPosting: acc.allowPosting,
        isActive: acc.isActive,
        own,
        aggregate: { ...own },
        children: []
      };

      node.children = build(acc.id);
      for (const child of node.children) {
        node.aggregate.debit += child.aggregate.debit;
        node.aggregate.credit += child.aggregate.credit;
        node.aggregate.closingBalance += child.aggregate.closingBalance;
      }

      return node;
    });

    return current;
  };

  return build(null);
}

export async function getSubtreeBalance(accountId: number, fiscalYear?: number, period?: number) {
  const tree = await getTree({ includeInactive: true, fiscalYear, period });

  const find = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === accountId) return node;
      const child = find(node.children);
      if (child) return child;
    }
    return null;
  };

  const node = find(tree);
  if (!node) throw Errors.notFound('الحساب غير موجود');

  return node;
}

export async function getBalance(accountId: number, fiscalYear?: number, period?: number) {
  const where: any = { accountId };
  if (fiscalYear) where.fiscalYear = fiscalYear;
  if (period) where.period = period;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw Errors.notFound('الحساب غير موجود');

  const balances = await prisma.accountBalance.findMany({
    where,
    orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }],
    take: 24
  });

  return { account, balances };
}

export async function rebuildLevels() {
  const roots = await prisma.account.findMany({ where: { parentId: null }, select: { id: true } });
  for (const root of roots) {
    await recalculateSubtreeLevels(root.id);
  }

  return { rebuiltRoots: roots.length };
}
