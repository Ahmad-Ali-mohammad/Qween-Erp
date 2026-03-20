import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { createApprovalWorkflowSchema, createBranchSchema, updateApprovalWorkflowSchema, updateBranchSchema } from '../../contracts/platform';
import * as service from './service';

const router = Router();

router.use(authenticate);

router.get('/branches', requirePermissions(PERMISSIONS.PLATFORM_READ), async (_req: Request, res: Response) => {
  ok(res, await service.listBranches());
});

router.get('/branches/:id', requirePermissions(PERMISSIONS.PLATFORM_READ), async (req: Request, res: Response) => {
  ok(res, await service.getBranch(Number(req.params.id)));
});

router.post(
  '/branches',
  requirePermissions(PERMISSIONS.PLATFORM_WRITE),
  validateBody(createBranchSchema),
  audit('branches'),
  async (req: Request, res: Response) => {
    ok(res, await service.createBranch(req.body), undefined, 201);
  }
);

router.put(
  '/branches/:id',
  requirePermissions(PERMISSIONS.PLATFORM_WRITE),
  validateBody(updateBranchSchema),
  audit('branches'),
  async (req: Request, res: Response) => {
    ok(res, await service.updateBranch(Number(req.params.id), req.body));
  }
);

router.delete('/branches/:id', requirePermissions(PERMISSIONS.PLATFORM_WRITE), audit('branches'), async (req: Request, res: Response) => {
  ok(res, await service.deleteBranch(Number(req.params.id)));
});

router.get('/approval-workflows', requirePermissions(PERMISSIONS.PLATFORM_READ), async (req: Request, res: Response) => {
  ok(res, await service.listApprovalWorkflows(req.query));
});

router.get('/approval-workflows/:id', requirePermissions(PERMISSIONS.PLATFORM_READ), async (req: Request, res: Response) => {
  ok(res, await service.getApprovalWorkflow(Number(req.params.id)));
});

router.post(
  '/approval-workflows',
  requirePermissions(PERMISSIONS.PLATFORM_WRITE),
  validateBody(createApprovalWorkflowSchema),
  audit('approval_workflows'),
  async (req: Request, res: Response) => {
    ok(res, await service.createApprovalWorkflow(req.body), undefined, 201);
  }
);

router.put(
  '/approval-workflows/:id',
  requirePermissions(PERMISSIONS.PLATFORM_WRITE),
  validateBody(updateApprovalWorkflowSchema),
  audit('approval_workflows'),
  async (req: Request, res: Response) => {
    ok(res, await service.updateApprovalWorkflow(Number(req.params.id), req.body));
  }
);

router.delete(
  '/approval-workflows/:id',
  requirePermissions(PERMISSIONS.PLATFORM_WRITE),
  audit('approval_workflows'),
  async (req: Request, res: Response) => {
    ok(res, await service.deleteApprovalWorkflow(Number(req.params.id)));
  }
);

router.get('/outbox-events', requirePermissions(PERMISSIONS.PLATFORM_READ), async (req: Request, res: Response) => {
  const result = await service.listOutboxEvents(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/outbox-events/:id', requirePermissions(PERMISSIONS.PLATFORM_READ), async (req: Request, res: Response) => {
  ok(res, await service.getOutboxEvent(Number(req.params.id)));
});

router.post('/outbox-events/:id/retry', requirePermissions(PERMISSIONS.PLATFORM_WRITE), async (req: Request, res: Response) => {
  ok(res, await service.retryFailedOutboxEvent(Number(req.params.id)));
});

export default router;
