import { randomUUID } from 'crypto';
import { Job, Queue, Worker } from 'bullmq';
import { createRedisConnectionOptions, isBullMqConfigured, isRedisConfigured } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { recordSyncBatch, recordSyncQueueJobState } from '../../observability/metrics';
import type { SyncBatchInput } from './dto';
import { applySyncBatch } from './service';

type SyncJobPayload = {
  batch: SyncBatchInput;
  userId: number;
};

type SyncJobResult = Awaited<ReturnType<typeof applySyncBatch>>;

let queue: Queue<SyncJobPayload, SyncJobResult> | null = null;
let worker: Worker<SyncJobPayload, SyncJobResult> | null = null;

function buildJobId(batch: SyncBatchInput): string {
  return batch.batchId ? `sync:${batch.batchId}` : `sync:${randomUUID()}`;
}

function serializeJob(job: Job<SyncJobPayload, SyncJobResult>, state: string) {
  return {
    id: String(job.id),
    name: job.name,
    state,
    batchId: job.data.batch.batchId ?? null,
    operations: job.data.batch.operations.length,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    result: job.returnvalue ?? null
  };
}

async function ensureSyncQueue(): Promise<boolean> {
  if (!isBullMqConfigured()) return false;
  if (queue && worker) return true;

  try {
    const queueConnection = createRedisConnectionOptions('erp-qween-sync-queue');
    const workerConnection = createRedisConnectionOptions('erp-qween-sync-worker');

    if (!queueConnection || !workerConnection) return false;

    queue ??= new Queue<SyncJobPayload, SyncJobResult>(env.syncQueueName, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: Math.max(1, env.syncQueueAttempts),
        removeOnComplete: 200,
        removeOnFail: 200
      }
    });

    worker ??= new Worker<SyncJobPayload, SyncJobResult>(
      env.syncQueueName,
      async (job) => {
        const result = await applySyncBatch(job.data.batch, job.data.userId);
        recordSyncQueueJobState('completed');
        return result;
      },
      {
        connection: workerConnection,
        concurrency: Math.max(1, env.syncQueueConcurrency)
      }
    );

    worker.on('failed', (job, error) => {
      recordSyncQueueJobState('failed');
      logger.error('Sync queue job failed', {
        jobId: job ? String(job.id) : null,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    worker.on('error', (error) => {
      logger.error('Sync queue worker error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  } catch (error) {
    logger.warn('Sync queue initialization failed, falling back to inline sync', {
      error: error instanceof Error ? error.message : String(error)
    });

    worker = null;
    queue = null;

    return false;
  }
}

export function getSyncQueueCapabilities() {
  return {
    enabled: env.bullmqEnabled,
    configured: isRedisConfigured(),
    available: isBullMqConfigured(),
    initialized: Boolean(queue && worker),
    queueName: env.syncQueueName
  };
}

export async function enqueueSyncBatch(batch: SyncBatchInput, userId: number) {
  const ready = await ensureSyncQueue();
  if (!ready || !queue) return null;

  const jobId = buildJobId(batch);

  try {
    const job = await queue.add(
      'apply-sync-batch',
      { batch, userId },
      {
        jobId
      }
    );

    recordSyncBatch('queued', 'accepted');
    return serializeJob(job, await job.getState());
  } catch (error) {
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      recordSyncBatch('queued', 'accepted');
      return serializeJob(existingJob, await existingJob.getState());
    }

    logger.warn('Failed to enqueue sync batch, falling back to inline sync', {
      batchId: batch.batchId ?? null,
      error: error instanceof Error ? error.message : String(error)
    });

    return null;
  }
}

export async function getSyncJobStatus(jobId: string) {
  const ready = await ensureSyncQueue();
  if (!ready || !queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return undefined;

  return serializeJob(job, await job.getState());
}

export async function shutdownSyncQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }

  if (queue) {
    await queue.close();
    queue = null;
  }
}
