import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess } from '../../utils/access-scope';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors, ok } from '../../utils/response';
import {
  calculateProjectCostSummary,
  createProjectExpense,
  deleteProjectExpense,
  recalculateProjectActualCost,
  updateProjectExpense
} from './service';

const router = Router();
const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

const phaseSchema = z
  .object({
    code: z.string().trim().max(50).optional(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().max(150).optional(),
    status: z.string().trim().max(40).optional(),
    sequence: z.coerce.number().int().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budget: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional()
  })
  .strict();

const budgetSchema = z
  .object({
    phaseId: z.coerce.number().int().positive().optional(),
    category: z.string().trim().min(1),
    baselineAmount: z.coerce.number().nonnegative().optional(),
    approvedAmount: z.coerce.number().nonnegative().optional(),
    committedAmount: z.coerce.number().nonnegative().optional(),
    actualAmount: z.coerce.number().nonnegative().optional(),
    currencyCode: z.string().trim().min(1).max(10).optional(),
    status: z.string().trim().max(40).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const changeOrderSchema = z
  .object({
    phaseId: z.coerce.number().int().positive().optional(),
    number: z.string().trim().max(60).optional(),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    amount: z.coerce.number(),
    impactDays: z.coerce.number().int().optional(),
    status: z.string().trim().max(40).optional(),
    requestedDate: z.string().optional()
  })
  .strict();

const expenseSchema = z
  .object({
    phaseId: z.coerce.number().int().positive().optional(),
    date: z.string().optional(),
    category: z.string().trim().max(80).optional(),
    description: z.string().trim().optional(),
    amount: z.coerce.number(),
    reference: z.string().trim().max(80).optional()
  })
  .strict();

router.use(authenticate);

function parseId(req: AuthRequest) {
  return idParamSchema.parse(req.params).id;
}

async function ensureProjectForAccess(req: AuthRequest, projectId: number, mode: 'read' | 'write' = 'read') {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, branchId: true }
  });
  if (!project) throw Errors.notFound('المشروع غير موجود');
  assertProjectScopeAccess(req, project.id, mode);
  if (project.branchId) assertBranchScopeAccess(req, project.branchId, mode);
  return project;
}

async function ensurePhaseInProject(req: AuthRequest, projectId: number, phaseId?: number, mode: 'read' | 'write' = 'write') {
  if (!phaseId) return;
  const phase = await prisma.projectPhase.findUnique({
    where: { id: phaseId },
    select: { id: true, projectId: true }
  });
  if (!phase || phase.projectId !== projectId) throw Errors.validation('المرحلة غير مرتبطة بالمشروع المحدد');
  await ensureProjectForAccess(req, phase.projectId, mode);
}

async function ensurePhaseAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const phase = await prisma.projectPhase.findUnique({
    where: { id },
    select: { id: true, projectId: true }
  });
  if (!phase) throw Errors.notFound('مرحلة المشروع غير موجودة');
  await ensureProjectForAccess(req, phase.projectId, mode);
  return phase;
}

async function ensureBudgetAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const budget = await prisma.projectBudget.findUnique({
    where: { id },
    select: { id: true, projectId: true }
  });
  if (!budget) throw Errors.notFound('ميزانية المشروع غير موجودة');
  await ensureProjectForAccess(req, budget.projectId, mode);
  return budget;
}

async function ensureChangeOrderAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const changeOrder = await prisma.changeOrder.findUnique({
    where: { id },
    select: { id: true, projectId: true }
  });
  if (!changeOrder) throw Errors.notFound('أمر التغيير غير موجود');
  await ensureProjectForAccess(req, changeOrder.projectId, mode);
  return changeOrder;
}

async function ensureExpenseAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const expense = await prisma.projectExpense.findUnique({
    where: { id },
    select: { id: true, projectId: true }
  });
  if (!expense) throw Errors.notFound('مصروف المشروع غير موجود');
  if (!expense.projectId) throw Errors.business('مصروف المشروع غير مرتبط بمشروع صالح');
  await ensureProjectForAccess(req, expense.projectId, mode);
  return expense;
}

router.get('/projects/:id/cost-summary', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId);
    ok(res, await calculateProjectCostSummary(projectId));
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/recalculate-costs', requirePermissions(PERMISSIONS.PROJECTS_WRITE), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId, 'write');
    ok(res, await recalculateProjectActualCost(projectId));
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id/phases', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId);
    ok(res, await prisma.projectPhase.findMany({ where: { projectId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] }));
  } catch (error) {
    next(error);
  }
});

router.get('/project-phases/:id', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensurePhaseAccess(req, id);
    const row = await prisma.projectPhase.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('مرحلة المشروع غير موجودة');
    ok(res, row);
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/phases', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(phaseSchema), audit('project_phases'), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId, 'write');
    ok(res, await prisma.projectPhase.create({ data: { ...req.body, projectId } }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/project-phases/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(phaseSchema.partial()), audit('project_phases'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensurePhaseAccess(req, id, 'write');
    ok(res, await prisma.projectPhase.update({ where: { id }, data: req.body }));
  } catch (error) {
    next(error);
  }
});

router.delete('/project-phases/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('project_phases'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensurePhaseAccess(req, id, 'write');
    await prisma.projectPhase.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id/budgets', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId);
    ok(res, await prisma.projectBudget.findMany({ where: { projectId }, orderBy: { id: 'desc' } }));
  } catch (error) {
    next(error);
  }
});

router.get('/project-budgets/:id', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureBudgetAccess(req, id);
    const row = await prisma.projectBudget.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('ميزانية المشروع غير موجودة');
    ok(res, row);
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/budgets', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(budgetSchema), audit('project_budgets'), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId, 'write');
    await ensurePhaseInProject(req, projectId, req.body.phaseId, 'write');
    ok(res, await prisma.projectBudget.create({ data: { ...req.body, projectId } }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/project-budgets/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(budgetSchema.partial()), audit('project_budgets'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    const current = await ensureBudgetAccess(req, id, 'write');
    await ensurePhaseInProject(req, current.projectId, req.body.phaseId, 'write');
    ok(res, await prisma.projectBudget.update({ where: { id }, data: req.body }));
  } catch (error) {
    next(error);
  }
});

router.delete('/project-budgets/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('project_budgets'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureBudgetAccess(req, id, 'write');
    await prisma.projectBudget.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id/change-orders', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId);
    ok(res, await prisma.changeOrder.findMany({ where: { projectId }, orderBy: { id: 'desc' } }));
  } catch (error) {
    next(error);
  }
});

router.get('/change-orders/:id', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureChangeOrderAccess(req, id);
    const row = await prisma.changeOrder.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('أمر التغيير غير موجود');
    ok(res, row);
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/change-orders', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(changeOrderSchema), audit('change_orders'), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId, 'write');
    await ensurePhaseInProject(req, projectId, req.body.phaseId, 'write');

    const year = new Date().getUTCFullYear();
    const count = await prisma.changeOrder.count({
      where: {
        createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
      }
    });

    ok(
      res,
      await prisma.changeOrder.create({
        data: {
          ...req.body,
          projectId,
          number: req.body.number ?? buildSequentialNumber('CO', count, year)
        }
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.put('/change-orders/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(changeOrderSchema.partial()), audit('change_orders'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    const current = await ensureChangeOrderAccess(req, id, 'write');
    await ensurePhaseInProject(req, current.projectId, req.body.phaseId, 'write');
    ok(res, await prisma.changeOrder.update({ where: { id }, data: req.body }));
  } catch (error) {
    next(error);
  }
});

router.delete('/change-orders/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('change_orders'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureChangeOrderAccess(req, id, 'write');
    await prisma.changeOrder.delete({ where: { id } });
    ok(res, { deleted: true });
  } catch (error) {
    next(error);
  }
});

router.post('/change-orders/:id/approve', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('change_orders'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureChangeOrderAccess(req, id, 'write');
    ok(
      res,
      await prisma.changeOrder.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date() }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/expenses', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(expenseSchema), audit('project_expenses'), async (req: AuthRequest, res: Response, next) => {
  try {
    const projectId = parseId(req);
    await ensureProjectForAccess(req, projectId, 'write');
    if (req.body.phaseId) await ensurePhaseInProject(req, projectId, req.body.phaseId, 'write');
    ok(res, await createProjectExpense(projectId, req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/project-expenses/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(expenseSchema.partial()), audit('project_expenses'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    const current = await ensureExpenseAccess(req, id, 'write');
    if (req.body.phaseId && current.projectId) await ensurePhaseInProject(req, current.projectId, req.body.phaseId, 'write');
    ok(res, await updateProjectExpense(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/project-expenses/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('project_expenses'), async (req: AuthRequest, res: Response, next) => {
  try {
    const id = parseId(req);
    await ensureExpenseAccess(req, id, 'write');
    ok(res, await deleteProjectExpense(id));
  } catch (error) {
    next(error);
  }
});

export default router;
