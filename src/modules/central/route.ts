import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import type { AuthRequest } from '../../types/auth';
import {
  acceptCentralEvent,
  createCentralApprovalRequest,
  getCentralExceptions,
  getCentralHealth,
  getCentralPermissions,
  listCentralApps,
  listCentralNavigation
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
  entityId: z.union([z.string(), z.number()]).transform(String),
  payload: z.record(z.unknown()).optional()
});

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

router.post('/events', authenticate, validateBody(eventSchema), (req: AuthRequest, res) => {
  ok(res, acceptCentralEvent(req.body, req.user), undefined, 202);
});

router.post('/approval-requests', authenticate, validateBody(approvalSchema), (req: AuthRequest, res) => {
  ok(res, createCentralApprovalRequest(req.body, req.user), undefined, 202);
});

export default router;

