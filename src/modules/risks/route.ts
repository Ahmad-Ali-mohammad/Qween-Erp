import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { Errors, ok } from '../../utils/response';

const router = Router();
const RISK_PREFIX = '[RISK]';

const riskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    dueDate: z.string().optional(),
    priority: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    ownerId: z.coerce.number().int().positive().optional()
  })
  .strict();

const riskUpdateSchema = riskCreateSchema.partial();

const mitigationSchema = z
  .object({
    notes: z.string().trim().min(1).max(1000),
    status: z.string().trim().max(40).optional()
  })
  .strict();

function normalizeTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.startsWith(RISK_PREFIX) ? trimmed : `${RISK_PREFIX} ${trimmed}`;
}

async function ensureRiskRecord(id: number) {
  const row = await prisma.userTask.findUnique({ where: { id } });
  if (!row || !row.title.startsWith(RISK_PREFIX)) {
    throw Errors.notFound('Risk item not found');
  }
  return row;
}

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.TASKS_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    const skip = (page - 1) * limit;
    const where = {
      title: { startsWith: RISK_PREFIX },
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.priority ? { priority: String(req.query.priority) } : {}),
      ...(req.query.ownerId ? { userId: Number(req.query.ownerId) } : {})
    } as const;

    const [rows, total] = await Promise.all([
      prisma.userTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }]
      }),
      prisma.userTask.count({ where })
    ]);

    ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.TASKS_WRITE), validateBody(riskCreateSchema), audit('user_tasks'), async (req, res, next) => {
  try {
    ok(
      res,
      await prisma.userTask.create({
        data: {
          userId: req.body.ownerId ?? null,
          title: normalizeTitle(req.body.title),
          description: req.body.description ?? null,
          dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
          priority: req.body.priority ?? 'MEDIUM',
          status: req.body.status ?? 'OPEN'
        }
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id(\\d+)', requirePermissions(PERMISSIONS.TASKS_READ), async (req, res, next) => {
  try {
    ok(res, await ensureRiskRecord(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id(\\d+)', requirePermissions(PERMISSIONS.TASKS_WRITE), validateBody(riskUpdateSchema), audit('user_tasks'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await ensureRiskRecord(id);
    ok(
      res,
      await prisma.userTask.update({
        where: { id },
        data: {
          ...('ownerId' in req.body ? { userId: req.body.ownerId ?? null } : {}),
          ...('title' in req.body ? { title: normalizeTitle(String(req.body.title)) } : {}),
          ...('description' in req.body ? { description: req.body.description ?? null } : {}),
          ...('dueDate' in req.body ? { dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null } : {}),
          ...('priority' in req.body ? { priority: req.body.priority } : {}),
          ...('status' in req.body ? { status: req.body.status } : {})
        }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/:id(\\d+)/mitigation', requirePermissions(PERMISSIONS.TASKS_WRITE), validateBody(mitigationSchema), audit('user_tasks'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await ensureRiskRecord(id);
    const previous = current.description?.trim();
    const mitigationLine = `[MITIGATION] ${req.body.notes.trim()}`;
    const description = previous ? `${previous}\n${mitigationLine}` : mitigationLine;

    ok(
      res,
      await prisma.userTask.update({
        where: { id },
        data: {
          description,
          status: req.body.status ?? 'IN_PROGRESS'
        }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.delete('/:id(\\d+)', requirePermissions(PERMISSIONS.TASKS_WRITE), audit('user_tasks'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await ensureRiskRecord(id);
    await prisma.userTask.delete({ where: { id } });
    ok(res, { deleted: true, id });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/high', requirePermissions(PERMISSIONS.TASKS_READ), async (_req, res, next) => {
  try {
    const rows = await prisma.userTask.findMany({
      where: {
        title: { startsWith: RISK_PREFIX },
        priority: { in: ['HIGH', 'CRITICAL'] },
        status: { notIn: ['CLOSED', 'MITIGATED'] }
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 100
    });

    ok(res, rows, {
      count: rows.length
    });
  } catch (error) {
    next(error);
  }
});

export default router;
