import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { Errors, ok } from '../../utils/response';
import type { AuthRequest } from '../../types/auth';
import {
  acceptCentralEvent,
  createCentralApprovalRequest,
  createNotification,
  createWorkflowInstance,
  getCentralExceptions,
  getCentralHealth,
  getCentralPermissions,
  getWorkflowInstance,
  listCentralApps,
  listCentralNavigation,
  listNotifications,
  listWorkflowInstances,
  markAllNotificationsRead,
  markNotificationRead,
  addWorkflowAction
} from './service';

const router = Router();

const eventSchema = z.object({
  eventName: z.string().min(3),
  aggregateType: z.string().min(2),
  aggregateId: z.union([z.string(), z.number()]).transform(String),
  payload: z.record(z.unknown()).optional()
});

const approvalSchema = z.object({
  workflowKey: z.string().min(2),
  title: z.string().min(3),
  entityType: z.string().min(2),
  entityId: z.coerce.number().int().positive(),
  payload: z.record(z.unknown()).optional()
});

const notificationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1),
    type: z.string().trim().max(40).optional(),
    userId: z.coerce.number().int().positive().optional()
  })
  .strict();

const workflowCreateSchema = z
  .object({
    workflowKey: z.string().trim().min(2),
    entityType: z.string().trim().min(2),
    entityId: z.coerce.number().int().positive(),
    status: z.string().trim().optional(),
    currentStep: z.string().trim().optional(),
    payload: z.record(z.unknown()).optional()
  })
  .strict();

const workflowActionSchema = z
  .object({
    actionKey: z.string().trim().min(1),
    actionStatus: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    payload: z.record(z.unknown()).optional()
  })
  .strict();

router.get('/apps', (_req, res) => {
  ok(res, listCentralApps());
});

router.get('/health', (_req, res) => {
  ok(res, getCentralHealth());
});

router.get('/navigation', authenticate, (req: AuthRequest, res) => {
  ok(res, listCentralNavigation(req.user));
});

router.get('/permissions', authenticate, (req: AuthRequest, res) => {
  ok(res, getCentralPermissions(req.user));
});

router.get('/exceptions', authenticate, (req: AuthRequest, res) => {
  ok(res, getCentralExceptions(req.user));
});

router.get('/info', authenticate, (req: AuthRequest, res) => {
  ok(res, {
    ...getCentralHealth(),
    permissions: getCentralPermissions(req.user)
  });
});

router.get('/notifications', authenticate, requirePermissions(PERMISSIONS.NOTIFICATIONS_READ), async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.user?.id ?? 0);
    if (!userId) throw Errors.unauthorized();
    const data = await listNotifications(userId, req.query);
    ok(res, data.rows, { ...data.pagination, unread: data.unread });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications', authenticate, requirePermissions(PERMISSIONS.NOTIFICATIONS_WRITE), validateBody(notificationSchema), audit('notifications'), async (req: AuthRequest, res, next) => {
  try {
    ok(res, await createNotification(req.body, req.user), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/:id/read', authenticate, requirePermissions(PERMISSIONS.NOTIFICATIONS_WRITE), audit('notifications'), async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.user?.id ?? 0);
    if (!userId) throw Errors.unauthorized();
    ok(res, await markNotificationRead(Number(req.params.id), userId));
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/read-all', authenticate, requirePermissions(PERMISSIONS.NOTIFICATIONS_WRITE), audit('notifications'), async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.user?.id ?? 0);
    if (!userId) throw Errors.unauthorized();
    ok(res, await markAllNotificationsRead(userId));
  } catch (error) {
    next(error);
  }
});

router.get('/workflows', authenticate, requirePermissions(PERMISSIONS.TASKS_READ), async (req: AuthRequest, res, next) => {
  try {
    const data = await listWorkflowInstances(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/workflows/:id', authenticate, requirePermissions(PERMISSIONS.TASKS_READ), async (req: AuthRequest, res, next) => {
  try {
    ok(res, await getWorkflowInstance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/workflows', authenticate, requirePermissions(PERMISSIONS.TASKS_WRITE), validateBody(workflowCreateSchema), audit('workflow_instances'), async (req: AuthRequest, res, next) => {
  try {
    ok(res, await createWorkflowInstance(req.body, req.user), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/:id/actions', authenticate, requirePermissions(PERMISSIONS.TASKS_WRITE), validateBody(workflowActionSchema), audit('workflow_actions'), async (req: AuthRequest, res, next) => {
  try {
    ok(res, await addWorkflowAction(Number(req.params.id), req.body, req.user), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/events', authenticate, validateBody(eventSchema), (req: AuthRequest, res) => {
  ok(res, acceptCentralEvent(req.body, req.user), undefined, 202);
});

router.post('/approval-requests', authenticate, validateBody(approvalSchema), async (req: AuthRequest, res, next) => {
  try {
    ok(res, await createCentralApprovalRequest(req.body, req.user), undefined, 202);
  } catch (error) {
    next(error);
  }
});

export default router;
