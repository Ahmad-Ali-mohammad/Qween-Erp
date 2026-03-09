import { Job, Queue, Worker } from 'bullmq';
import { createRedisConnectionOptions, isBullMqConfigured, isRedisConfigured } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { processPrintJob } from './service';

type PrintQueuePayload = {
  printJobId: number;
};

let queue: Queue<PrintQueuePayload, unknown> | null = null;
let worker: Worker<PrintQueuePayload, unknown> | null = null;

function serializeJob(job: Job<PrintQueuePayload, unknown>, state: string) {
  return {
    id: String(job.id),
    name: job.name,
    state,
    printJobId: job.data.printJobId,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null
  };
}

async function ensurePrintingQueue(): Promise<boolean> {
  if (!isBullMqConfigured()) return false;
  if (queue && worker) return true;

  try {
    const queueConnection = createRedisConnectionOptions('erp-qween-printing-queue');
    const workerConnection = createRedisConnectionOptions('erp-qween-printing-worker');
    if (!queueConnection || !workerConnection) return false;

    queue ??= new Queue<PrintQueuePayload, unknown>(env.printingQueueName, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: Math.max(1, env.printingQueueAttempts),
        removeOnComplete: 200,
        removeOnFail: 200
      }
    });

    worker ??= new Worker<PrintQueuePayload, unknown>(
      env.printingQueueName,
      async (job) => processPrintJob(job.data.printJobId),
      {
        connection: workerConnection,
        concurrency: Math.max(1, env.printingQueueConcurrency)
      }
    );

    worker.on('failed', (job, error) => {
      logger.error('Printing queue job failed', {
        jobId: job ? String(job.id) : null,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    worker.on('error', (error) => {
      logger.error('Printing queue worker error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  } catch (error) {
    logger.warn('Printing queue initialization failed, falling back to inline printing', {
      error: error instanceof Error ? error.message : String(error)
    });

    worker = null;
    queue = null;
    return false;
  }
}

export function getPrintingQueueCapabilities() {
  return {
    enabled: env.bullmqEnabled,
    configured: isRedisConfigured(),
    available: isBullMqConfigured(),
    initialized: Boolean(queue && worker),
    queueName: env.printingQueueName
  };
}

export async function enqueuePrintJob(printJobId: number) {
  const ready = await ensurePrintingQueue();
  if (!ready || !queue) return null;

  const jobId = `print:${printJobId}`;

  try {
    const job = await queue.add(
      'process-print-job',
      { printJobId },
      {
        jobId
      }
    );

    return serializeJob(job, await job.getState());
  } catch (error) {
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      return serializeJob(existingJob, await existingJob.getState());
    }

    logger.warn('Failed to enqueue print job, falling back to inline printing', {
      printJobId,
      error: error instanceof Error ? error.message : String(error)
    });

    return null;
  }
}

export async function getPrintingQueueJobStatus(jobId: string) {
  const ready = await ensurePrintingQueue();
  if (!ready || !queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return undefined;

  return serializeJob(job, await job.getState());
}

export async function shutdownPrintingQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }

  if (queue) {
    await queue.close();
    queue = null;
  }
}
