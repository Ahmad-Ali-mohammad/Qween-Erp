import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { recordSyncBatch } from '../../observability/metrics';
import { syncBatchSchema, syncResources } from './dto';
import { enqueueSyncBatch, getSyncJobStatus, getSyncQueueCapabilities } from './queue';
import { applySyncBatch } from './service';

const router = Router();

router.use(authenticate);

router.get('/queue', requirePermissions(PERMISSIONS.SYNC_READ), (_req, res) => {
  ok(res, getSyncQueueCapabilities());
});

router.get('/stats', requirePermissions(PERMISSIONS.SYNC_READ), (_req, res) => {
  const queue = getSyncQueueCapabilities();
  ok(res, {
    queue,
    totals: { pending: 0, completed: 0, failed: 0 }
  });
});

router.get('/resources', requirePermissions(PERMISSIONS.SYNC_READ), (_req, res) => {
  ok(res, { resources: syncResources, queue: getSyncQueueCapabilities() });
});

router.get('/jobs/:id', requirePermissions(PERMISSIONS.SYNC_READ), async (req, res, next) => {
  try {
    const queue = getSyncQueueCapabilities();
    const job = await getSyncJobStatus(req.params.id);

    ok(
      res,
      {
        queue,
        job: job ?? null
      },
      undefined,
      200,
      {
        status: {
          code: queue.available ? 'SYNC_JOB_STATUS' : 'SYNC_QUEUE_UNAVAILABLE'
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.SYNC_WRITE), validateBody(syncBatchSchema), async (req: any, res, next) => {
  try {
    const queueState = getSyncQueueCapabilities();
    const queuedJob = queueState.available ? await enqueueSyncBatch(req.body, req.user.id) : null;

    if (queuedJob) {
      ok(
        res,
        {
          batchId: req.body.batchId ?? null,
          receivedAt: new Date().toISOString(),
          strategy: 'LAST_WRITE_WINS',
          mode: 'queued',
          queue: getSyncQueueCapabilities(),
          job: queuedJob
        },
        undefined,
        202,
        {
          status: {
            code: 'SYNC_JOB_QUEUED'
          }
        }
      );
      return;
    }

    const result = await applySyncBatch(req.body, req.user.id);
    recordSyncBatch(queueState.enabled ? 'fallback' : 'inline', 'applied');

    ok(
      res,
      {
        ...result,
        mode: 'inline',
        queue: {
          ...getSyncQueueCapabilities(),
          fallbackUsed: queueState.enabled
        }
      },
      undefined,
      202,
      {
        status: {
          code: queueState.enabled ? 'SYNC_APPLIED_INLINE_FALLBACK' : 'SYNC_APPLIED_INLINE'
        }
      }
    );
  } catch (error) {
    recordSyncBatch(getSyncQueueCapabilities().enabled ? 'fallback' : 'inline', 'failed');
    next(error);
  }
});

export default router;
