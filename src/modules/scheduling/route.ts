import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { Errors, ok } from '../../utils/response';
import * as siteService from '../site/service';

const router = Router();

const taskCreateSchema = z
  .object({
    projectId: z.coerce.number().int().positive(),
    phaseId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    assigneeId: z.coerce.number().int().positive().optional(),
    priority: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    estimatedHours: z.coerce.number().nonnegative().optional()
  })
  .strict();

const taskUpdateSchema = z
  .object({
    phaseId: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().nullable().optional(),
    assigneeId: z.coerce.number().int().positive().nullable().optional(),
    priority: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    startDate: z.string().trim().nullable().optional(),
    endDate: z.string().trim().nullable().optional(),
    estimatedHours: z.coerce.number().nonnegative().optional()
  })
  .strict();

const progressSchema = z
  .object({
    projectId: z.coerce.number().int().positive(),
    phaseId: z.coerce.number().int().positive().optional(),
    taskId: z.coerce.number().int().positive(),
    entryDate: z.string().optional(),
    progressPercent: z.coerce.number().min(0).max(100),
    quantityCompleted: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const dependencySchema = z
  .object({
    predecessorId: z.coerce.number().int().positive(),
    type: z.string().trim().max(10).optional(),
    lagDays: z.coerce.number().int().optional()
  })
  .strict();

const resourceSchema = z
  .object({
    resourceType: z.string().trim().min(1).max(40),
    resourceId: z.coerce.number().int().positive(),
    role: z.string().trim().max(80).optional(),
    allocationPct: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

router.use(authenticate);

async function ensureScheduleTask(taskId: number) {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) {
    throw Errors.notFound('المهمة غير موجودة');
  }

  await prisma.scheduleTask.upsert({
    where: { id: taskId },
    update: {},
    create: {
      id: taskId,
      baselineStartDate: task.startDate,
      baselineEndDate: task.endDate
    }
  });

  return task;
}

async function ensureResourceExists(resourceType: string, resourceId: number) {
  const kind = resourceType.trim().toUpperCase();
  if (kind === 'EMPLOYEE') {
    const row = await prisma.employee.findUnique({ where: { id: resourceId }, select: { id: true } });
    if (!row) throw Errors.validation('الموظف غير موجود');
    return;
  }
  if (kind === 'ASSET' || kind === 'EQUIPMENT') {
    const row = await prisma.fixedAsset.findUnique({ where: { id: resourceId }, select: { id: true } });
    if (!row) throw Errors.validation('المعدة غير موجودة');
    return;
  }
  if (kind === 'SUBCONTRACTOR') {
    const row = await prisma.subcontractor.findUnique({ where: { id: resourceId }, select: { id: true } });
    if (!row) throw Errors.validation('المقاول غير موجود');
    return;
  }
  if (kind === 'USER') {
    const row = await prisma.user.findUnique({ where: { id: resourceId }, select: { id: true } });
    if (!row) throw Errors.validation('المستخدم غير موجود');
    return;
  }
  throw Errors.validation('نوع المورد غير مدعوم');
}

router.get('/tasks', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const where = projectId ? { projectId } : {};
    const rows = await prisma.projectTask.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }, { id: 'asc' }]
    });
    ok(res, rows);
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:projectId/gantt', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const [project, phases, tasks] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, code: true, nameAr: true, startDate: true, endDate: true, status: true }
      }),
      prisma.projectPhase.findMany({
        where: { projectId },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }]
      }),
      prisma.projectTask.findMany({
        where: { projectId },
        orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }, { id: 'asc' }]
      })
    ]);

    ok(res, { project, phases, tasks });
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:projectId/tasks', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const rows = await prisma.projectTask.findMany({
      where: { projectId },
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }, { id: 'asc' }]
    });
    ok(res, rows);
  } catch (error) {
    next(error);
  }
});

router.get('/tasks/:id', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.projectTask.findUnique({
      where: { id },
      include: { project: true, phase: true }
    });
    if (!row) {
      throw Errors.notFound('المهمة غير موجودة');
    }
    ok(res, row);
  } catch (error) {
    next(error);
  }
});

router.post('/tasks', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(taskCreateSchema), audit('project_tasks'), async (req, res, next) => {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.projectTask.create({
        data: {
          projectId: req.body.projectId,
          phaseId: req.body.phaseId ?? null,
          title: req.body.title,
          description: req.body.description ?? null,
          assigneeId: req.body.assigneeId ?? null,
          priority: req.body.priority ?? 'MEDIUM',
          status: req.body.status ?? 'TODO',
          startDate: req.body.startDate ? new Date(req.body.startDate) : null,
          endDate: req.body.endDate ? new Date(req.body.endDate) : null,
          estimatedHours: req.body.estimatedHours ?? 0
        }
      });

      await tx.scheduleTask.create({
        data: {
          id: task.id,
          baselineStartDate: task.startDate,
          baselineEndDate: task.endDate
        }
      });

      return task;
    });

    ok(res, created, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/tasks/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(taskUpdateSchema), audit('project_tasks'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw Errors.validation('معرف المهمة غير صالح');
    }

    const current = await prisma.projectTask.findUnique({ where: { id } });
    if (!current) {
      throw Errors.notFound('المهمة غير موجودة');
    }

    if (req.body.phaseId !== undefined && req.body.phaseId !== null) {
      const phase = await prisma.projectPhase.findUnique({ where: { id: Number(req.body.phaseId) } });
      if (!phase || (current.projectId && phase.projectId !== current.projectId)) {
        throw Errors.validation('المرحلة غير مرتبطة بالمشروع المحدد');
      }
    }

    const data: Record<string, unknown> = {};

    if (req.body.phaseId !== undefined) data.phaseId = req.body.phaseId ?? null;
    if (req.body.title !== undefined) data.title = req.body.title;
    if (req.body.description !== undefined) data.description = req.body.description ?? null;
    if (req.body.assigneeId !== undefined) data.assigneeId = req.body.assigneeId ?? null;
    if (req.body.priority !== undefined) data.priority = req.body.priority ?? current.priority;
    if (req.body.status !== undefined) data.status = req.body.status ?? current.status;
    if (req.body.startDate !== undefined) data.startDate = req.body.startDate ? new Date(String(req.body.startDate)) : null;
    if (req.body.endDate !== undefined) data.endDate = req.body.endDate ? new Date(String(req.body.endDate)) : null;
    if (req.body.estimatedHours !== undefined) data.estimatedHours = req.body.estimatedHours ?? current.estimatedHours;

    const updated = await prisma.projectTask.update({
      where: { id },
      data
    });
    ok(res, updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/tasks/:id', requirePermissions(PERMISSIONS.PROJECTS_WRITE), audit('project_tasks'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw Errors.validation('معرف المهمة غير صالح');
    }

    const current = await prisma.projectTask.findUnique({ where: { id } });
    if (!current) {
      throw Errors.notFound('المهمة غير موجودة');
    }

    await prisma.projectTask.delete({ where: { id } });
    ok(res, { deleted: true, id });
  } catch (error) {
    next(error);
  }
});

router.post('/tasks/:id/progress', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(progressSchema), audit('site_progress_entries'), async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    ok(
      res,
      await siteService.createProgressEntry({
        projectId: req.body.projectId,
        phaseId: req.body.phaseId,
        taskId,
        entryDate: req.body.entryDate,
        progressPercent: req.body.progressPercent,
        quantityCompleted: req.body.quantityCompleted,
        description: req.body.description,
        notes: req.body.notes
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.get('/tasks/:id/dependencies', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    await ensureScheduleTask(taskId);

    const [predecessors, successors] = await Promise.all([
      prisma.taskDependency.findMany({
        where: { successorId: taskId },
        include: { predecessor: { include: { projectTask: true } } },
        orderBy: [{ id: 'asc' }]
      }),
      prisma.taskDependency.findMany({
        where: { predecessorId: taskId },
        include: { successor: { include: { projectTask: true } } },
        orderBy: [{ id: 'asc' }]
      })
    ]);

    ok(res, { predecessors, successors });
  } catch (error) {
    next(error);
  }
});

router.post('/tasks/:id/dependencies', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(dependencySchema), audit('task_dependencies'), async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    if (taskId === Number(req.body.predecessorId)) {
      throw Errors.validation('لا يمكن ربط المهمة بنفسها');
    }

    await ensureScheduleTask(taskId);
    await ensureScheduleTask(Number(req.body.predecessorId));

    const row = await prisma.taskDependency.create({
      data: {
        predecessorId: Number(req.body.predecessorId),
        successorId: taskId,
        type: req.body.type ?? 'FS',
        lagDays: req.body.lagDays ?? 0
      }
    });

    ok(res, row, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/tasks/:id/resources', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    await ensureScheduleTask(taskId);
    const rows = await prisma.resourceAssignment.findMany({
      where: { scheduleTaskId: taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    ok(res, rows);
  } catch (error) {
    next(error);
  }
});

router.post('/tasks/:id/resources', requirePermissions(PERMISSIONS.PROJECTS_WRITE), validateBody(resourceSchema), audit('resource_assignments'), async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    await ensureScheduleTask(taskId);
    await ensureResourceExists(req.body.resourceType, Number(req.body.resourceId));

    const row = await prisma.resourceAssignment.create({
      data: {
        scheduleTaskId: taskId,
        resourceType: String(req.body.resourceType).trim().toUpperCase(),
        resourceId: Number(req.body.resourceId),
        role: req.body.role ?? null,
        allocationPct: req.body.allocationPct ?? 100,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        notes: req.body.notes ?? null
      }
    });

    ok(res, row, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:projectId/progress', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const data = await siteService.listProgressEntries(
      {
        projectId,
        page: req.query.page,
        limit: req.query.limit
      },
      undefined
    );
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:projectId/critical-path', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const tasks = await prisma.projectTask.findMany({
      where: { projectId },
      orderBy: [{ endDate: 'asc' }, { startDate: 'asc' }, { id: 'asc' }]
    });

    const critical = tasks.filter((task) => {
      const status = String(task.status ?? '').toUpperCase();
      return status !== 'DONE' && status !== 'CLOSED';
    });

    ok(res, {
      totalTasks: tasks.length,
      criticalTasks: critical.length,
      tasks: critical
    });
  } catch (error) {
    next(error);
  }
});

export default router;
