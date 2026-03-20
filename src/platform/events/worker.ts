import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { publishOutboxBatch, shutdownOutboxPublisher } from './publisher';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const published = await publishOutboxBatch();
    if (published > 0) {
      logger.info('Published outbox batch', { published });
    }
  } catch (error) {
    logger.error('Outbox worker tick failed', { error });
  } finally {
    running = false;
  }
}

export function startOutboxWorker(): void {
  if (timer || !env.rabbitMqEnabled) {
    if (!env.rabbitMqEnabled) {
      logger.info('Outbox worker disabled because RabbitMQ is not enabled');
    }
    return;
  }

  timer = setInterval(() => {
    void tick();
  }, env.outboxPollIntervalMs);

  void tick();
}

export async function stopOutboxWorker(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await shutdownOutboxPublisher();
}
