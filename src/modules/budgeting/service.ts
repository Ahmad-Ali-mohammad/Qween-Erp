import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import type { BudgetControlLevel } from '@prisma/client';

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function toAmount(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw Errors.validation(`${fieldName} غير صالح`);
  return roundAmount(amount);
}

function toPositiveInt(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed <= 0) throw Errors.validation(`${fieldName} غير صالح`);
  return parsed;
}

function toText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function buildPage(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function buildAllocationKey(input: {
  versionId: number;
  accountId: number;
  period: number;
  branchId?: number | null;
  projectId?: number | null;
  costCenterId?: number | null;
  departmentId?: number | null;
  contractId?: number | null;
}) {
  return [
    input.versionId,
    input.accountId,
    input.period,
    input.branchId ?? 0,
    input.projectId ?? 0,
    input.costCenterId ?? 0,
    input.departmentId ?? 0,
    input.contractId ?? 0
  ].join(':');
}

function buildVarianceKey(allocationId: number, period: number) {
  return `${allocationId}:${period}`;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeStatus(value: unknown, fallback: string) {
  const text = String(value ?? fallback).trim().toUpperCase();
  return text || fallback;
}

function normalizeApprovalStatus(value: unknown, fallback: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED') {
  const text = String(value ?? fallback).trim().toUpperCase();
  return ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].includes(text) ? (text as typeof fallback) : fallback;
}

function normalizePostingStatus(value: unknown, fallback: 'UNPOSTED' | 'POSTED' | 'REVERSED' | 'NOT_APPLICABLE') {
  const text = String(value ?? fallback).trim().toUpperCase();
  return ['UNPOSTED', 'POSTED', 'REVERSED', 'NOT_APPLICABLE'].includes(text) ? (text as typeof fallback) : fallback;
}

function normalizeControlLevel(value: unknown, fallback: BudgetControlLevel = 'NONE'): BudgetControlLevel {
  const text = String(value ?? fallback).trim().toUpperCase();
  return ['NONE', 'WARNING', 'HARD'].includes(text) ? (text as BudgetControlLevel) : fallback;
}

function buildLegacyBudgetCode(scenarioCode: string, versionNumber: number) {
  return `${scenarioCode}-V${versionNumber}`;
}

function computeVariance(plannedAmount: number, actualAmount: number, committedAmount: number) {
  return roundAmount(plannedAmount - actualAmount - committedAmount);
}

function classifyVariance(varianceAmount: number, plannedAmount: number) {
  const absolute = Math.abs(varianceAmount);
  if (absolute <= 0.009) return null;
  const ratio = plannedAmount > 0 ? absolute / plannedAmount : absolute > 0 ? 1 : 0;
  if (ratio >= 0.2) return 'CRITICAL';
  if (ratio >= 0.1) return 'HIGH';
  if (ratio >= 0.05) return 'MEDIUM';
  return 'LOW';
}

async function ensureBranch(tx: any, branchId: number | null) {
  if (!branchId) return null;
  const branch = await tx.branch.findUnique({
    where: { id: branchId },
    select: { id: true, code: true, nameAr: true }
  });
  if (!branch) throw Errors.notFound('الفرع غير موجود');
  return branch;
}

async function ensureAccount(tx: any, accountId: number | null) {
  if (!accountId) throw Errors.validation('الحساب مطلوب');
  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, nameAr: true, allowPosting: true, isActive: true }
  });
  if (!account) throw Errors.notFound('الحساب غير موجود');
  if (!account.allowPosting || !account.isActive) throw Errors.business('الحساب غير جاهز للتحميل على الموازنة');
  return account;
}

async function ensureProject(tx: any, projectId: number | null) {
  if (!projectId) return null;
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, nameAr: true, branchId: true }
  });
  if (!project) throw Errors.notFound('المشروع غير موجود');
  return project;
}

async function ensureCostCenter(tx: any, costCenterId: number | null) {
  if (!costCenterId) return null;
  const row = await tx.costCenter.findUnique({
    where: { id: costCenterId },
    select: { id: true, code: true, nameAr: true, isActive: true }
  });
  if (!row) throw Errors.notFound('مركز التكلفة غير موجود');
  if (!row.isActive) throw Errors.business('مركز التكلفة غير نشط');
  return row;
}

async function ensureDepartment(tx: any, departmentId: number | null) {
  if (!departmentId) return null;
  const row = await tx.department.findUnique({
    where: { id: departmentId },
    select: { id: true, code: true, nameAr: true, isActive: true }
  });
  if (!row) throw Errors.notFound('الإدارة غير موجودة');
  if (!row.isActive) throw Errors.business('الإدارة غير نشطة');
  return row;
}

async function ensureContract(tx: any, contractId: number | null) {
  if (!contractId) return null;
  const row = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, number: true, title: true, branchId: true }
  });
  if (!row) throw Errors.notFound('العقد غير موجود');
  return row;
}

async function fetchScenario(tx: any, id: number) {
  const row = await tx.budgetScenario.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }]
      },
      _count: {
        select: {
          allocations: true,
          forecasts: true,
          variances: true
        }
      }
    }
  });
  if (!row) throw Errors.notFound('سيناريو الموازنة غير موجود');
  return row;
}

async function fetchVersion(tx: any, id: number) {
  const row = await tx.budgetVersion.findUnique({
    where: { id },
    include: {
      scenario: true,
      _count: {
        select: {
          allocations: true,
          forecasts: true,
          variances: true
        }
      }
    }
  });
  if (!row) throw Errors.notFound('إصدار الموازنة غير موجود');
  return row;
}

async function fetchLabelsByIds<T>(
  tx: any,
  modelName: string,
  ids: Array<number | null | undefined>,
  select: Record<string, boolean>
): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await tx[modelName].findMany({
    where: { id: { in: uniqueIds } },
    select
  });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

async function enrichScenarioRows(tx: any, rows: any[]) {
  const branchMap = await fetchLabelsByIds<any>(tx, 'branch', rows.map((row) => row.branchId), {
    id: true,
    code: true,
    nameAr: true
  });

  return rows.map((row) => ({
    ...row,
    branch: row.branchId ? branchMap.get(row.branchId) ?? null : null
  }));
}

async function enrichVersionRows(_tx: any, rows: any[]) {
  return rows.map((row) => ({
    ...row,
    scenario: row.scenario ?? null
  }));
}

async function enrichAllocationRows(tx: any, rows: any[]) {
  const [accountMap, projectMap, costCenterMap, departmentMap, contractMap, branchMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'account', rows.map((row) => row.accountId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'costCenter', rows.map((row) => row.costCenterId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'department', rows.map((row) => row.departmentId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'contract', rows.map((row) => row.contractId), { id: true, number: true, title: true }),
    fetchLabelsByIds<any>(tx, 'branch', rows.map((row) => row.branchId), { id: true, code: true, nameAr: true })
  ]);

  return rows.map((row) => ({
    ...row,
    account: row.accountId ? accountMap.get(row.accountId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    costCenter: row.costCenterId ? costCenterMap.get(row.costCenterId) ?? null : null,
    department: row.departmentId ? departmentMap.get(row.departmentId) ?? null : null,
    contract: row.contractId ? contractMap.get(row.contractId) ?? null : null,
    branch: row.branchId ? branchMap.get(row.branchId) ?? null : null
  }));
}

async function enrichVarianceRows(tx: any, rows: any[]) {
  return enrichAllocationRows(tx, rows);
}

async function getScenarioWithinTx(tx: any, id: number) {
  const row = await fetchScenario(tx, id);
  return (await enrichScenarioRows(tx, [row]))[0];
}

async function getVersionWithinTx(tx: any, id: number) {
  const row = await fetchVersion(tx, id);
  return (await enrichVersionRows(tx, [row]))[0];
}

async function listAllocationsWithinTx(tx: any, query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.versionId) where.versionId = Number(query.versionId);
  if (query.scenarioId) where.scenarioId = Number(query.scenarioId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.period) where.period = Number(query.period);

  const [rows, total] = await Promise.all([
    tx.budgetAllocation.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    tx.budgetAllocation.count({ where })
  ]);

  return {
    rows: await enrichAllocationRows(tx, rows),
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

async function syncLegacyBudgetForVersion(tx: any, versionId: number) {
  const version = await tx.budgetVersion.findUnique({
    where: { id: versionId },
    include: { scenario: true }
  });
  if (!version) throw Errors.notFound('إصدار الموازنة غير موجود');

  if (version.legacyBudgetId) {
    return tx.budget.update({
      where: { id: version.legacyBudgetId },
      data: {
        nameAr: version.scenario.nameAr,
        nameEn: version.scenario.nameEn,
        fiscalYear: version.scenario.fiscalYear,
        version: version.label,
        controlLevel: version.scenario.controlLevel,
        totalAmount: version.plannedTotal,
        status: version.status === 'PUBLISHED' ? 'ACTIVE' : version.status === 'ARCHIVED' ? 'CLOSED' : 'DRAFT'
      }
    });
  }

  const legacyBudget = await tx.budget.create({
    data: {
      code: buildLegacyBudgetCode(version.scenario.code, version.versionNumber),
      nameAr: version.scenario.nameAr,
      nameEn: version.scenario.nameEn,
      fiscalYear: version.scenario.fiscalYear,
      version: version.label,
      controlLevel: version.scenario.controlLevel,
      totalAmount: version.plannedTotal,
      status: version.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT'
    }
  });

  await tx.budgetVersion.update({
    where: { id: version.id },
    data: { legacyBudgetId: legacyBudget.id }
  });

  return legacyBudget;
}

async function syncLegacyBudgetLinesForVersion(tx: any, versionId: number) {
  const version = await tx.budgetVersion.findUnique({
    where: { id: versionId },
    select: { id: true, legacyBudgetId: true }
  });
  if (!version?.legacyBudgetId) return;

  const allocations = await tx.budgetAllocation.findMany({
    where: { versionId },
    orderBy: [{ accountId: 'asc' }, { period: 'asc' }]
  });

  const grouped = new Map<string, { accountId: number; period: number; amount: number; actual: number; committed: number; variance: number }>();
  for (const row of allocations) {
    const accountId = Number(row.accountId ?? 0);
    if (!accountId) continue;
    const key = `${accountId}:${row.period}`;
    const current = grouped.get(key) ?? { accountId, period: row.period, amount: 0, actual: 0, committed: 0, variance: 0 };
    current.amount = roundAmount(current.amount + Number(row.plannedAmount ?? 0));
    current.actual = roundAmount(current.actual + Number(row.actualAmount ?? 0));
    current.committed = roundAmount(current.committed + Number(row.committedAmount ?? 0));
    current.variance = roundAmount(current.variance + Number(row.varianceAmount ?? 0));
    grouped.set(key, current);
  }

  const existingLines = await tx.budgetLine.findMany({
    where: { budgetId: version.legacyBudgetId }
  });

  for (const line of existingLines) {
    const key = `${line.accountId}:${line.period}`;
    const desired = grouped.get(key);
    if (!desired) {
      await tx.budgetLine.delete({ where: { id: line.id } });
      continue;
    }
    const updated = await tx.budgetLine.update({
      where: { id: line.id },
      data: {
        amount: desired.amount,
        actual: desired.actual,
        committed: desired.committed,
        variance: desired.variance
      }
    });
    await tx.budgetAllocation.updateMany({
      where: {
        versionId,
        accountId: desired.accountId,
        period: desired.period
      },
      data: {
        legacyLineId: updated.id
      }
    });
    grouped.delete(key);
  }

  for (const desired of grouped.values()) {
    const created = await tx.budgetLine.create({
      data: {
        budgetId: version.legacyBudgetId,
        accountId: desired.accountId,
        period: desired.period,
        amount: desired.amount,
        actual: desired.actual,
        committed: desired.committed,
        variance: desired.variance
      }
    });
    await tx.budgetAllocation.updateMany({
      where: {
        versionId,
        accountId: desired.accountId,
        period: desired.period
      },
      data: {
        legacyLineId: created.id
      }
    });
  }
}

async function syncVersionTotals(tx: any, versionId: number) {
  const allocations = await tx.budgetAllocation.findMany({
    where: { versionId },
    select: {
      plannedAmount: true,
      actualAmount: true,
      committedAmount: true,
      varianceAmount: true
    }
  });

  const totals = allocations.reduce(
    (
      acc: { plannedTotal: number; actualTotal: number; committedTotal: number; varianceTotal: number },
      row: { plannedAmount: unknown; actualAmount: unknown; committedAmount: unknown; varianceAmount: unknown }
    ) => {
      acc.plannedTotal = roundAmount(acc.plannedTotal + Number(row.plannedAmount ?? 0));
      acc.actualTotal = roundAmount(acc.actualTotal + Number(row.actualAmount ?? 0));
      acc.committedTotal = roundAmount(acc.committedTotal + Number(row.committedAmount ?? 0));
      acc.varianceTotal = roundAmount(acc.varianceTotal + Number(row.varianceAmount ?? 0));
      return acc;
    },
    { plannedTotal: 0, actualTotal: 0, committedTotal: 0, varianceTotal: 0 }
  );

  const version = await tx.budgetVersion.update({
    where: { id: versionId },
    data: totals
  });

  await syncLegacyBudgetForVersion(tx, versionId);
  return version;
}

async function syncVarianceEntriesForVersion(tx: any, versionId: number, userId: number | null) {
  const allocations = await tx.budgetAllocation.findMany({
    where: { versionId },
    orderBy: [{ id: 'asc' }]
  });
  const existingRows = await tx.varianceEntry.findMany({
    where: { versionId }
  });
  const keepIds = new Set<number>();
  let varianceCount = 0;

  for (const allocation of allocations) {
    const plannedAmount = Number(allocation.plannedAmount ?? 0);
    const actualAmount = Number(allocation.actualAmount ?? 0);
    const committedAmount = Number(allocation.committedAmount ?? 0);
    const varianceAmount = computeVariance(plannedAmount, actualAmount, committedAmount);
    const severity = classifyVariance(varianceAmount, plannedAmount);

    if (!severity) continue;
    varianceCount += 1;

    const variance = await tx.varianceEntry.upsert({
      where: { varianceKey: buildVarianceKey(allocation.id, allocation.period) },
      update: {
        scenarioId: allocation.scenarioId,
        branchId: allocation.branchId,
        accountId: allocation.accountId,
        projectId: allocation.projectId,
        costCenterId: allocation.costCenterId,
        departmentId: allocation.departmentId,
        contractId: allocation.contractId,
        legacyLineId: allocation.legacyLineId,
        plannedAmount,
        actualAmount,
        committedAmount,
        varianceAmount,
        severity,
        status: 'OPEN',
        detectedAt: new Date(),
        updatedById: userId
      },
      create: {
        varianceKey: buildVarianceKey(allocation.id, allocation.period),
        scenarioId: allocation.scenarioId,
        versionId: allocation.versionId,
        allocationId: allocation.id,
        branchId: allocation.branchId,
        accountId: allocation.accountId,
        projectId: allocation.projectId,
        costCenterId: allocation.costCenterId,
        departmentId: allocation.departmentId,
        contractId: allocation.contractId,
        legacyLineId: allocation.legacyLineId,
        period: allocation.period,
        plannedAmount,
        actualAmount,
        committedAmount,
        varianceAmount,
        severity,
        status: 'OPEN',
        createdById: userId,
        updatedById: userId
      }
    });
    keepIds.add(variance.id);
  }

  const staleIds = existingRows.filter((row: { id: number }) => !keepIds.has(row.id)).map((row: { id: number }) => row.id);
  if (staleIds.length) {
    await tx.varianceEntry.deleteMany({
      where: { id: { in: staleIds } }
    });
  }

  return varianceCount;
}

function currentForecastTotal(version: any) {
  return roundAmount(Math.max(Number(version.plannedTotal ?? 0), Number(version.actualTotal ?? 0) + Number(version.committedTotal ?? 0)));
}

export async function listScenarios(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.fiscalYear) where.fiscalYear = Number(query.fiscalYear);
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus).trim().toUpperCase();
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.budgetScenario.findMany({
        where,
        skip: pageState.skip,
        take: pageState.limit,
        include: {
          versions: { orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }], take: 5 },
          _count: { select: { versions: true, allocations: true, variances: true, forecasts: true } }
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
      }),
      tx.budgetScenario.count({ where })
    ]);

    return {
      rows: await enrichScenarioRows(tx, rows),
      meta: {
        page: pageState.page,
        limit: pageState.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pageState.limit))
      }
    };
  });
}

export async function getScenario(id: number) {
  return prisma.$transaction(async (tx) => {
    const row = await fetchScenario(tx, id);
    return (await enrichScenarioRows(tx, [row]))[0];
  });
}

export async function createScenario(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const branchId = toPositiveInt(data.branchId, 'branchId', true);
    await ensureBranch(tx, branchId);

    const row = await tx.budgetScenario.create({
      data: {
        code: String(data.code ?? '').trim(),
        nameAr: String(data.nameAr ?? '').trim(),
        nameEn: toText(data.nameEn),
        fiscalYear: Number(data.fiscalYear),
        branchId,
        status: normalizeStatus(data.status, 'DRAFT'),
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        controlLevel: normalizeControlLevel(data.controlLevel, 'NONE'),
        notes: toText(data.notes),
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'budgeting.scenario.created',
      aggregateType: 'BudgetScenario',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      correlationId: `budget-scenario:${row.id}:created`,
      payload: {
        scenarioId: row.id,
        code: row.code,
        nameAr: row.nameAr,
        fiscalYear: row.fiscalYear,
        controlLevel: row.controlLevel
      }
    });

    return getScenarioWithinTx(tx, row.id);
  });
}

export async function updateScenario(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await fetchScenario(tx, id);
    const branchId = data.branchId !== undefined ? toPositiveInt(data.branchId, 'branchId', true) : current.branchId;
    await ensureBranch(tx, branchId);

    const row = await tx.budgetScenario.update({
      where: { id },
      data: {
        code: data.code !== undefined ? String(data.code).trim() : current.code,
        nameAr: data.nameAr !== undefined ? String(data.nameAr).trim() : current.nameAr,
        nameEn: data.nameEn !== undefined ? toText(data.nameEn) : current.nameEn,
        fiscalYear: data.fiscalYear !== undefined ? Number(data.fiscalYear) : current.fiscalYear,
        branchId,
        status: data.status !== undefined ? normalizeStatus(data.status, current.status) : current.status,
        approvalStatus:
          data.approvalStatus !== undefined ? normalizeApprovalStatus(data.approvalStatus, current.approvalStatus) : current.approvalStatus,
        postingStatus:
          data.postingStatus !== undefined ? normalizePostingStatus(data.postingStatus, current.postingStatus) : current.postingStatus,
        controlLevel: data.controlLevel !== undefined ? normalizeControlLevel(data.controlLevel, current.controlLevel) : current.controlLevel,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        updatedById: userId
      }
    });

    if (current.legacyBudgetId) {
      await tx.budget.update({
        where: { id: current.legacyBudgetId },
        data: {
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          fiscalYear: row.fiscalYear,
          controlLevel: row.controlLevel
        }
      });
    }

    return getScenarioWithinTx(tx, row.id);
  });
}

export async function submitScenario(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await fetchScenario(tx, id);
    if (current.approvalStatus === 'APPROVED') throw Errors.business('تم اعتماد السيناريو بالفعل');

    const row = await tx.budgetScenario.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'budgeting.scenario.submitted',
      aggregateType: 'BudgetScenario',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      correlationId: `budget-scenario:${row.id}:submitted`,
      payload: {
        scenarioId: row.id,
        code: row.code
      }
    });

    return getScenarioWithinTx(tx, id);
  });
}

export async function approveScenario(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await fetchScenario(tx, id);
    const row = await tx.budgetScenario.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'budgeting.scenario.approved',
      aggregateType: 'BudgetScenario',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      correlationId: `budget-scenario:${row.id}:approved`,
      payload: {
        scenarioId: row.id,
        code: row.code,
        previousStatus: current.status
      }
    });

    return getScenarioWithinTx(tx, id);
  });
}

export async function listVersions(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.scenarioId) where.scenarioId = Number(query.scenarioId);
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus).trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.budgetVersion.findMany({
        where,
        skip: pageState.skip,
        take: pageState.limit,
        include: {
          scenario: true,
          _count: { select: { allocations: true, forecasts: true, variances: true } }
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
      }),
      tx.budgetVersion.count({ where })
    ]);

    return {
      rows: await enrichVersionRows(tx, rows),
      meta: {
        page: pageState.page,
        limit: pageState.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pageState.limit))
      }
    };
  });
}

export async function getVersion(id: number) {
  return prisma.$transaction(async (tx) => {
    const row = await fetchVersion(tx, id);
    return (await enrichVersionRows(tx, [row]))[0];
  });
}

export async function createVersion(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const scenario = await fetchScenario(tx, Number(data.scenarioId));
    const nextVersionNumber =
      data.versionNumber !== undefined
        ? Number(data.versionNumber)
        : (await tx.budgetVersion.count({ where: { scenarioId: scenario.id } })) + 1;

    const row = await tx.budgetVersion.create({
      data: {
        scenarioId: scenario.id,
        label: String(data.label ?? '').trim(),
        versionNumber: nextVersionNumber,
        effectiveDate: data.effectiveDate ? parseDateOrThrow(data.effectiveDate, 'effectiveDate') : null,
        status: normalizeStatus(data.status, 'DRAFT'),
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        notes: data.notes !== undefined ? toText(data.notes) : null,
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        createdById: userId,
        updatedById: userId
      }
    });

    await syncLegacyBudgetForVersion(tx, row.id);
    return getVersionWithinTx(tx, row.id);
  });
}

export async function updateVersion(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await fetchVersion(tx, id);
    const row = await tx.budgetVersion.update({
      where: { id },
      data: {
        label: data.label !== undefined ? String(data.label).trim() : current.label,
        versionNumber: data.versionNumber !== undefined ? Number(data.versionNumber) : current.versionNumber,
        effectiveDate:
          data.effectiveDate !== undefined ? (data.effectiveDate ? parseDateOrThrow(data.effectiveDate, 'effectiveDate') : null) : current.effectiveDate,
        status: data.status !== undefined ? normalizeStatus(data.status, current.status) : current.status,
        approvalStatus:
          data.approvalStatus !== undefined ? normalizeApprovalStatus(data.approvalStatus, current.approvalStatus) : current.approvalStatus,
        postingStatus:
          data.postingStatus !== undefined ? normalizePostingStatus(data.postingStatus, current.postingStatus) : current.postingStatus,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        updatedById: userId
      }
    });

    await syncLegacyBudgetForVersion(tx, row.id);
    return getVersionWithinTx(tx, row.id);
  });
}

export async function publishVersion(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await fetchVersion(tx, id);
    if (!current._count.allocations) throw Errors.business('لا يمكن نشر إصدار بدون تخصيصات');

    await tx.budgetVersion.updateMany({
      where: {
        scenarioId: current.scenarioId,
        id: { not: id },
        status: 'PUBLISHED'
      },
      data: {
        status: 'ARCHIVED',
        updatedById: userId
      }
    });

    const row = await tx.budgetVersion.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        approvalStatus: 'APPROVED',
        publishedAt: new Date(),
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        updatedById: userId
      }
    });

    await tx.budgetScenario.update({
      where: { id: current.scenarioId },
      data: {
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        legacyBudgetId: row.legacyBudgetId,
        publishedVersionId: row.id,
        updatedById: userId
      }
    });

    await syncLegacyBudgetForVersion(tx, id);
    if (row.legacyBudgetId) {
      await tx.budget.update({
        where: { id: row.legacyBudgetId },
        data: { status: 'ACTIVE' }
      });
      await tx.budget.updateMany({
        where: {
          id: { not: row.legacyBudgetId },
          code: { startsWith: `${current.scenario.code}-V` }
        },
        data: { status: 'CLOSED' }
      });
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'budgeting.version.published',
      aggregateType: 'BudgetVersion',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: current.scenario.branchId ?? null,
      correlationId: `budget-version:${row.id}:published`,
      payload: {
        scenarioId: current.scenarioId,
        versionId: row.id,
        label: row.label,
        plannedTotal: row.plannedTotal,
        varianceTotal: row.varianceTotal
      }
    });

    return getVersionWithinTx(tx, id);
  });
}

export async function listAllocations(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.versionId) where.versionId = Number(query.versionId);
  if (query.scenarioId) where.scenarioId = Number(query.scenarioId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.period) where.period = Number(query.period);

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.budgetAllocation.findMany({
        where,
        skip: pageState.skip,
        take: pageState.limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
      }),
      tx.budgetAllocation.count({ where })
    ]);

    return {
      rows: await enrichAllocationRows(tx, rows),
      meta: {
        page: pageState.page,
        limit: pageState.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pageState.limit))
      }
    };
  });
}

export async function upsertAllocations(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const version = await fetchVersion(tx, Number(data.versionId));
    const scenarioId = data.scenarioId ? Number(data.scenarioId) : version.scenarioId;
    if (scenarioId !== version.scenarioId) throw Errors.validation('scenarioId لا يطابق الإصدار المحدد');

    for (const allocationInput of data.allocations as any[]) {
      const branchId = toPositiveInt(allocationInput.branchId ?? version.scenario.branchId, 'branchId', true);
      const accountId = toPositiveInt(allocationInput.accountId, 'accountId');
      const projectId = toPositiveInt(allocationInput.projectId, 'projectId', true);
      const costCenterId = toPositiveInt(allocationInput.costCenterId, 'costCenterId', true);
      const departmentId = toPositiveInt(allocationInput.departmentId, 'departmentId', true);
      const contractId = toPositiveInt(allocationInput.contractId, 'contractId', true);

      await Promise.all([
        ensureBranch(tx, branchId),
        ensureAccount(tx, accountId),
        ensureProject(tx, projectId),
        ensureCostCenter(tx, costCenterId),
        ensureDepartment(tx, departmentId),
        ensureContract(tx, contractId)
      ]);

      const period = Number(allocationInput.period);
      const plannedAmount = toAmount(allocationInput.plannedAmount, 'plannedAmount') ?? 0;
      const actualAmount = toAmount(allocationInput.actualAmount ?? 0, 'actualAmount') ?? 0;
      const committedAmount = toAmount(allocationInput.committedAmount ?? 0, 'committedAmount') ?? 0;
      const varianceAmount = computeVariance(plannedAmount, actualAmount, committedAmount);
      const allocationKey = buildAllocationKey({
        versionId: version.id,
        accountId: accountId!,
        period,
        branchId,
        projectId,
        costCenterId,
        departmentId,
        contractId
      });

      await tx.budgetAllocation.upsert({
        where: { allocationKey },
        update: {
          scenarioId: version.scenarioId,
          branchId,
          accountId,
          projectId,
          costCenterId,
          departmentId,
          contractId,
          period,
          plannedAmount,
          actualAmount,
          committedAmount,
          varianceAmount,
          status: normalizeStatus(allocationInput.status, 'ACTIVE'),
          approvalStatus: normalizeApprovalStatus(allocationInput.approvalStatus, 'DRAFT'),
          postingStatus: normalizePostingStatus(allocationInput.postingStatus, 'NOT_APPLICABLE'),
          attachmentsCount: Number(allocationInput.attachmentsCount ?? 0) || 0,
          note: allocationInput.note !== undefined ? toText(allocationInput.note) : null,
          updatedById: userId
        },
        create: {
          allocationKey,
          scenarioId: version.scenarioId,
          versionId: version.id,
          branchId,
          accountId,
          projectId,
          costCenterId,
          departmentId,
          contractId,
          period,
          plannedAmount,
          actualAmount,
          committedAmount,
          varianceAmount,
          status: normalizeStatus(allocationInput.status, 'ACTIVE'),
          approvalStatus: normalizeApprovalStatus(allocationInput.approvalStatus, 'DRAFT'),
          postingStatus: normalizePostingStatus(allocationInput.postingStatus, 'NOT_APPLICABLE'),
          attachmentsCount: Number(allocationInput.attachmentsCount ?? 0) || 0,
          note: toText(allocationInput.note),
          createdById: userId,
          updatedById: userId
        }
      });
    }

    await syncLegacyBudgetForVersion(tx, version.id);
    await syncLegacyBudgetLinesForVersion(tx, version.id);
    const syncedVersion = await syncVersionTotals(tx, version.id);
    const varianceCount = await syncVarianceEntriesForVersion(tx, version.id, userId);

    if (varianceCount > 0) {
      await enqueueOutboxEvent(tx, {
        eventType: 'budgeting.variance.detected',
        aggregateType: 'BudgetVersion',
        aggregateId: String(version.id),
        actorId: userId,
        branchId: version.scenario.branchId ?? null,
        correlationId: `budget-version:${version.id}:variance`,
        payload: {
          scenarioId: version.scenarioId,
          versionId: version.id,
          varianceCount,
          varianceTotal: syncedVersion.varianceTotal
        }
      });
    }

    return listAllocationsWithinTx(tx, { versionId: version.id, page: 1, limit: 200 });
  });
}

export async function listForecastSnapshots(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.versionId) where.versionId = Number(query.versionId);
  if (query.scenarioId) where.scenarioId = Number(query.scenarioId);
  if (query.branchId) where.branchId = Number(query.branchId);

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.forecastSnapshot.findMany({
        where,
        skip: pageState.skip,
        take: pageState.limit,
        orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }]
      }),
      tx.forecastSnapshot.count({ where })
    ]);

    const versionIds = rows
      .map((row: { versionId: number | null }) => row.versionId)
      .filter((value): value is number => Number.isInteger(value));
    const scenarioIds = rows
      .map((row: { scenarioId: number | null }) => row.scenarioId)
      .filter((value): value is number => Number.isInteger(value));
    const [versionMap, scenarioMap] = await Promise.all([
      fetchLabelsByIds<any>(tx, 'budgetVersion', versionIds, { id: true, label: true, versionNumber: true, scenarioId: true }),
      fetchLabelsByIds<any>(tx, 'budgetScenario', scenarioIds, { id: true, code: true, nameAr: true })
    ]);

    const enrichedRows = rows.map((row: { versionId: number | null; scenarioId: number | null }) => ({
      ...row,
      version: row.versionId ? versionMap.get(row.versionId) ?? null : null,
      scenario: row.scenarioId ? scenarioMap.get(row.scenarioId) ?? null : null
    }));

    return {
      rows: enrichedRows,
      meta: {
        page: pageState.page,
        limit: pageState.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pageState.limit))
      }
    };
  });
}

export async function createForecastSnapshot(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const version = await fetchVersion(tx, Number(data.versionId));
    const branchId = toPositiveInt(data.branchId ?? version.scenario.branchId, 'branchId', true);
    await ensureBranch(tx, branchId);

    const snapshotDate = data.snapshotDate ? parseDateOrThrow(data.snapshotDate, 'snapshotDate') : new Date();
    const label = String(data.label ?? `Forecast ${monthKey(snapshotDate)}`).trim();
    const forecastTotal = currentForecastTotal(version);

    const row = await tx.forecastSnapshot.create({
      data: {
        scenarioId: version.scenarioId,
        versionId: version.id,
        branchId,
        snapshotDate,
        label,
        plannedTotal: version.plannedTotal,
        actualTotal: version.actualTotal,
        forecastTotal,
        varianceTotal: version.varianceTotal,
        status: 'SNAPSHOT',
        approvalStatus: 'APPROVED',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'budgeting.forecast.snapshot.created',
      aggregateType: 'ForecastSnapshot',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      correlationId: `budget-forecast:${row.id}:created`,
      payload: {
        scenarioId: row.scenarioId,
        versionId: row.versionId,
        forecastTotal: row.forecastTotal,
        varianceTotal: row.varianceTotal
      }
    });

    return row;
  });
}

export async function listVariances(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.versionId) where.versionId = Number(query.versionId);
  if (query.scenarioId) where.scenarioId = Number(query.scenarioId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.severity) where.severity = String(query.severity).trim().toUpperCase();
  if (query.status) where.status = String(query.status).trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.varianceEntry.findMany({
        where,
        skip: pageState.skip,
        take: pageState.limit,
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }]
      }),
      tx.varianceEntry.count({ where })
    ]);

    const summary = rows.reduce(
      (
        acc: { plannedAmount: number; actualAmount: number; committedAmount: number; varianceAmount: number },
        row: { plannedAmount: unknown; actualAmount: unknown; committedAmount: unknown; varianceAmount: unknown }
      ) => {
        acc.plannedAmount = roundAmount(acc.plannedAmount + Number(row.plannedAmount ?? 0));
        acc.actualAmount = roundAmount(acc.actualAmount + Number(row.actualAmount ?? 0));
        acc.committedAmount = roundAmount(acc.committedAmount + Number(row.committedAmount ?? 0));
        acc.varianceAmount = roundAmount(acc.varianceAmount + Number(row.varianceAmount ?? 0));
        return acc;
      },
      { plannedAmount: 0, actualAmount: 0, committedAmount: 0, varianceAmount: 0 }
    );

    return {
      rows: await enrichVarianceRows(tx, rows),
      meta: {
        page: pageState.page,
        limit: pageState.limit,
        total,
        pages: Math.max(1, Math.ceil(total / pageState.limit)),
        summary
      }
    };
  });
}

export async function listLegacyBudgets() {
  return prisma.budget.findMany({ include: { lines: true }, orderBy: { id: 'desc' } });
}

export async function getLegacyBudget(id: number) {
  return prisma.budget.findUnique({
    where: { id },
    include: {
      lines: {
        include: { account: true },
        orderBy: { period: 'asc' }
      }
    }
  });
}

export async function createLegacyBudget(data: any, userId: number) {
  const scenario = await createScenario(
    {
      code: data.code,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      fiscalYear: data.fiscalYear,
      controlLevel: data.controlLevel ?? 'NONE',
      status: data.status ?? 'DRAFT',
      approvalStatus: data.status === 'ACTIVE' ? 'APPROVED' : 'DRAFT',
      attachmentsCount: 0
    },
    userId
  );

  const version = await createVersion(
    {
      scenarioId: scenario.id,
      label: data.version ?? 'Original',
      status: data.status === 'ACTIVE' ? 'PUBLISHED' : 'DRAFT',
      approvalStatus: data.status === 'ACTIVE' ? 'APPROVED' : 'DRAFT'
    },
    userId
  );

  if (String(data.status ?? '').toUpperCase() === 'ACTIVE') {
    await publishVersion(version.id, {}, userId);
  }

  const refreshedVersion = await getVersion(version.id);
  const legacyBudgetId = Number(refreshedVersion.legacyBudgetId ?? 0);
  if (!legacyBudgetId) throw Errors.internal('تعذر إنشاء طبقة التوافق للموازنة');
  return getLegacyBudget(legacyBudgetId);
}

export async function updateLegacyBudget(id: number, data: any, userId: number) {
  const mappedVersion = await prisma.budgetVersion.findFirst({
    where: { legacyBudgetId: id },
    include: { scenario: true }
  });
  if (!mappedVersion) {
    return prisma.budget.update({ where: { id }, data });
  }

  await prisma.$transaction(async (tx) => {
    const currentVersion = await tx.budgetVersion.findUnique({
      where: { id: mappedVersion.id },
      include: { scenario: true }
    });
    if (!currentVersion) throw Errors.notFound('إصدار الموازنة غير موجود');

    await tx.budgetScenario.update({
      where: { id: currentVersion.scenarioId },
      data: {
        code: data.code !== undefined ? String(data.code).trim() : currentVersion.scenario.code,
        nameAr: data.nameAr !== undefined ? String(data.nameAr).trim() : currentVersion.scenario.nameAr,
        nameEn: data.nameEn !== undefined ? toText(data.nameEn) : currentVersion.scenario.nameEn,
        fiscalYear: data.fiscalYear !== undefined ? Number(data.fiscalYear) : currentVersion.scenario.fiscalYear,
        controlLevel:
          data.controlLevel !== undefined ? normalizeControlLevel(data.controlLevel, currentVersion.scenario.controlLevel) : currentVersion.scenario.controlLevel,
        updatedById: userId
      }
    });

    await tx.budgetVersion.update({
      where: { id: currentVersion.id },
      data: {
        label: data.version !== undefined ? String(data.version).trim() : currentVersion.label,
        updatedById: userId
      }
    });

    await syncLegacyBudgetForVersion(tx, currentVersion.id);
  });

  if (String(data.status ?? '').toUpperCase() === 'ACTIVE') {
    await publishVersion(mappedVersion.id, {}, userId);
  }

  return getLegacyBudget(id);
}

export async function approveLegacyBudget(id: number, userId: number) {
  const mappedVersion = await prisma.budgetVersion.findFirst({ where: { legacyBudgetId: id } });
  if (!mappedVersion) {
    await prisma.budget.update({ where: { id }, data: { status: 'ACTIVE' } });
    return getLegacyBudget(id);
  }
  await publishVersion(mappedVersion.id, {}, userId);
  return getLegacyBudget(id);
}

export async function deleteLegacyBudget(id: number) {
  return prisma.$transaction(async (tx) => {
    const mappedVersion = await tx.budgetVersion.findFirst({
      where: { legacyBudgetId: id },
      select: { id: true, scenarioId: true }
    });

    if (!mappedVersion) {
      await tx.budget.delete({ where: { id } });
      return { deleted: true };
    }

    await tx.varianceEntry.deleteMany({ where: { versionId: mappedVersion.id } });
    await tx.forecastSnapshot.deleteMany({ where: { versionId: mappedVersion.id } });
    await tx.budgetAllocation.deleteMany({ where: { versionId: mappedVersion.id } });
    await tx.budgetVersion.delete({ where: { id: mappedVersion.id } });
    await tx.budgetLine.deleteMany({ where: { budgetId: id } });
    await tx.budget.delete({ where: { id } });

    const remainingVersions = await tx.budgetVersion.count({ where: { scenarioId: mappedVersion.scenarioId } });
    if (!remainingVersions) {
      await tx.budgetScenario.delete({ where: { id: mappedVersion.scenarioId } });
    }

    return { deleted: true };
  });
}

export async function listLegacyBudgetLines(query: any) {
  const where: any = {};
  if (query.budgetId) where.budgetId = Number(query.budgetId);
  return prisma.budgetLine.findMany({
    where,
    include: { budget: true, account: true },
    orderBy: [{ budgetId: 'desc' }, { period: 'asc' }]
  });
}

export async function createLegacyBudgetLine(data: any, userId: number) {
  const mappedVersion = await prisma.budgetVersion.findFirst({ where: { legacyBudgetId: Number(data.budgetId) } });
  if (!mappedVersion) {
    return prisma.budgetLine.create({ data });
  }

  await upsertAllocations(
    {
      versionId: mappedVersion.id,
      allocations: [
        {
          accountId: Number(data.accountId),
          period: Number(data.period),
          plannedAmount: Number(data.amount ?? 0),
          actualAmount: Number(data.actual ?? 0),
          committedAmount: Number(data.committed ?? 0),
          branchId: null
        }
      ]
    },
    userId
  );

  return prisma.budgetLine.findFirst({
    where: {
      budgetId: Number(data.budgetId),
      accountId: Number(data.accountId),
      period: Number(data.period)
    },
    orderBy: { id: 'desc' }
  });
}

export async function updateLegacyBudgetLine(id: number, data: any, userId: number) {
  const current = await prisma.budgetLine.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('بند الموازنة غير موجود');
  const mappedVersion = await prisma.budgetVersion.findFirst({ where: { legacyBudgetId: current.budgetId } });
  if (!mappedVersion) {
    return prisma.budgetLine.update({ where: { id }, data });
  }

  const allocation = await prisma.budgetAllocation.findFirst({
    where: { legacyLineId: id },
    orderBy: { id: 'asc' }
  });

  await upsertAllocations(
    {
      versionId: mappedVersion.id,
      allocations: [
        {
          id: allocation?.id,
          legacyLineId: id,
          accountId: Number(data.accountId ?? current.accountId),
          period: Number(data.period ?? current.period),
          plannedAmount: Number(data.amount ?? current.amount),
          actualAmount: Number(data.actual ?? current.actual),
          committedAmount: Number(data.committed ?? current.committed)
        }
      ]
    },
    userId
  );

  return prisma.budgetLine.findUnique({ where: { id } });
}

export async function deleteLegacyBudgetLine(id: number) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.budgetAllocation.findFirst({
      where: { legacyLineId: id },
      select: { id: true, versionId: true }
    });

    if (!allocation) {
      await tx.budgetLine.delete({ where: { id } });
      return { deleted: true };
    }

    await tx.budgetAllocation.delete({ where: { id: allocation.id } });
    await syncLegacyBudgetLinesForVersion(tx, allocation.versionId);
    await syncVersionTotals(tx, allocation.versionId);
    await syncVarianceEntriesForVersion(tx, allocation.versionId, null);
    return { deleted: true };
  });
}

export async function getLegacyBudgetVariance(budgetId: number) {
  const lines = await prisma.budgetLine.findMany({
    where: { budgetId },
    include: { account: true },
    orderBy: { period: 'asc' }
  });
  const summary = lines.reduce(
    (acc, row) => {
      acc.budget += Number(row.amount);
      acc.actual += Number(row.actual);
      acc.variance += Number(row.variance);
      return acc;
    },
    { budget: 0, actual: 0, variance: 0 }
  );
  return { summary, lines };
}

export async function listLegacyBudgetSummary() {
  return prisma.budget.findMany({ orderBy: { id: 'desc' } });
}
