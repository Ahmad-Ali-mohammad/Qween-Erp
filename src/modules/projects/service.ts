import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';

type ProjectDb = Prisma.TransactionClient | typeof prisma;

function toNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  return Number(value ?? 0);
}

function buildExpenseEventPayload(expense: {
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

export async function calculateProjectCostSummary(projectId: number, db: ProjectDb = prisma) {
  const [project, phases, budgets, changeOrders, expenses, tasks] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.projectPhase.findMany({ where: { projectId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] }),
    db.projectBudget.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
    db.changeOrder.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
    db.projectExpense.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
    db.projectTask.findMany({ where: { projectId }, orderBy: { id: 'asc' } })
  ]);

  if (!project) throw Errors.notFound('المشروع غير موجود');

  const approvedStatuses = new Set(['APPROVED', 'IMPLEMENTED']);
  const baselineBudget = budgets.length
    ? budgets.reduce((sum, row) => sum + toNumber(row.baselineAmount), 0)
    : toNumber(project.budget);
  const approvedBudget = budgets.reduce((sum, row) => sum + toNumber(row.approvedAmount || row.baselineAmount), 0);
  const committedBudget = budgets.reduce((sum, row) => sum + toNumber(row.committedAmount), 0);
  const actualBudget = budgets.reduce((sum, row) => sum + toNumber(row.actualAmount), 0);
  const approvedChangeOrders = changeOrders
    .filter((row) => approvedStatuses.has(String(row.status).toUpperCase()))
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const actualCost = expenses.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const totalBudgetWithChanges = (approvedBudget || baselineBudget) + approvedChangeOrders;

  const phaseSummaries = phases.map((phase) => {
    const phaseBudgets = budgets.filter((row) => row.phaseId === phase.id);
    const phaseExpenses = expenses.filter((row) => row.phaseId === phase.id);
    const phaseTasks = tasks.filter((row) => row.phaseId === phase.id);
    const phaseChanges = changeOrders.filter((row) => row.phaseId === phase.id);
    const phaseApprovedChanges = phaseChanges
      .filter((row) => approvedStatuses.has(String(row.status).toUpperCase()))
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const phaseBudget = phaseBudgets.length
      ? phaseBudgets.reduce((sum, row) => sum + toNumber(row.approvedAmount || row.baselineAmount), 0)
      : toNumber(phase.budget);
    const phaseActual = phaseExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0);

    return {
      id: phase.id,
      code: phase.code,
      nameAr: phase.nameAr,
      status: phase.status,
      sequence: phase.sequence,
      budget: phaseBudget,
      approvedChangeOrders: phaseApprovedChanges,
      actualCost: phaseActual,
      variance: phaseBudget + phaseApprovedChanges - phaseActual,
      tasks: {
        total: phaseTasks.length,
        completed: phaseTasks.filter((row) => String(row.status).toUpperCase() === 'DONE').length
      }
    };
  });

  return {
    project: {
      id: project.id,
      code: project.code,
      nameAr: project.nameAr,
      status: project.status
    },
    summary: {
      baselineBudget,
      approvedBudget,
      committedBudget,
      actualBudget,
      approvedChangeOrders,
      totalBudgetWithChanges,
      actualCost,
      budgetVariance: totalBudgetWithChanges - actualCost,
      tasks: {
        total: tasks.length,
        completed: tasks.filter((row) => String(row.status).toUpperCase() === 'DONE').length,
        inProgress: tasks.filter((row) => String(row.status).toUpperCase() === 'IN_PROGRESS').length
      }
    },
    phases: phaseSummaries
  };
}

export async function recalculateProjectActualCost(projectId: number, db: ProjectDb = prisma) {
  const summary = await calculateProjectCostSummary(projectId, db);

  await db.project.update({
    where: { id: projectId },
    data: { actualCost: summary.summary.actualCost }
  });

  for (const phase of summary.phases) {
    await db.projectPhase.update({
      where: { id: phase.id },
      data: { actualCost: phase.actualCost }
    });
  }

  return summary;
}

export async function createProjectExpense(
  projectId: number,
  data: { phaseId?: number; date?: string; category?: string; description?: string; amount: number; reference?: string }
) {
  const expense = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw Errors.notFound('المشروع غير موجود');

    if (data.phaseId) {
      const phase = await tx.projectPhase.findUnique({ where: { id: data.phaseId } });
      if (!phase || phase.projectId !== projectId) throw Errors.validation('المرحلة غير مرتبطة بالمشروع المحدد');
    }

    const expense = await tx.projectExpense.create({
      data: {
        projectId,
        phaseId: data.phaseId ?? null,
        date: data.date ? parseDateOrThrow(data.date) : new Date(),
        category: data.category,
        description: data.description,
        amount: data.amount,
        reference: data.reference
      }
    });

    await recalculateProjectActualCost(projectId, tx);
    return expense;
  });

  emitAccountingEvent('project.expense.recorded', buildExpenseEventPayload(expense as typeof expense & { projectId: number }));
  return expense;
}

export async function updateProjectExpense(
  id: number,
  data: { phaseId?: number | null; date?: string; category?: string; description?: string; amount?: number; reference?: string }
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.projectExpense.findUnique({ where: { id } });
    if (!current || !current.projectId) throw Errors.notFound('مصروف المشروع غير موجود');

    const nextPhaseId = data.phaseId === undefined ? current.phaseId : data.phaseId;
    if (nextPhaseId) {
      const phase = await tx.projectPhase.findUnique({ where: { id: nextPhaseId } });
      if (!phase || phase.projectId !== current.projectId) throw Errors.validation('المرحلة غير مرتبطة بالمشروع المحدد');
    }

    const expense = await tx.projectExpense.update({
      where: { id },
      data: {
        phaseId: nextPhaseId ?? null,
        date: data.date ? parseDateOrThrow(data.date) : undefined,
        category: data.category,
        description: data.description,
        amount: data.amount,
        reference: data.reference
      }
    });

    await recalculateProjectActualCost(current.projectId, tx);
    return { previous: current, expense };
  });

  emitAccountingEvent('project.expense.updated', {
    ...buildExpenseEventPayload(result.expense as typeof result.expense & { projectId: number }),
    previousAmount: toNumber(result.previous.amount),
    previousPhaseId: result.previous.phaseId
  });

  return result.expense;
}

export async function deleteProjectExpense(id: number) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.projectExpense.findUnique({ where: { id } });
    if (!current || !current.projectId) throw Errors.notFound('مصروف المشروع غير موجود');

    await tx.projectExpense.delete({ where: { id } });
    await recalculateProjectActualCost(current.projectId, tx);
    return { deleted: true, id, expense: current };
  });

  emitAccountingEvent('project.expense.deleted', buildExpenseEventPayload(result.expense as typeof result.expense & { projectId: number }));
  return { deleted: true, id: result.id };
}
