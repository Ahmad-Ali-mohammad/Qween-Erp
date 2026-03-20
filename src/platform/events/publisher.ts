import amqp, { Channel, ChannelModel } from 'amqplib';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { listPendingOutboxEvents, markOutboxEventFailed, markOutboxEventPublished } from './outbox';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

function resetConnectionState(): void {
  connection = null;
  channel = null;
}

async function ensureChannel(): Promise<Channel> {
  if (channel) return channel;

  connection = await amqp.connect(env.rabbitMqUrl);
  connection.on('error', (error) => {
    logger.error('RabbitMQ connection error', { error });
    resetConnectionState();
  });
  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    resetConnectionState();
  });

  const nextChannel = await connection.createChannel();
  await nextChannel.assertExchange(env.rabbitMqExchange, 'topic', { durable: true });
  await nextChannel.prefetch(env.rabbitMqPrefetch);
  channel = nextChannel;
  return nextChannel;
}

export async function publishOutboxBatch(): Promise<number> {
  if (!env.rabbitMqEnabled) return 0;

  const pending = await listPendingOutboxEvents(env.outboxBatchSize);
  if (!pending.length) return 0;

  const rabbitChannel = await ensureChannel();
  let published = 0;

  for (const event of pending) {
    try {
      const body = Buffer.from(
        JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          occurredAt: event.occurredAt.toISOString(),
          actorId: event.actorId,
          branchId: event.branchId,
          correlationId: event.correlationId,
          version: event.version,
          payload: event.payload
        })
      );

      rabbitChannel.publish(env.rabbitMqExchange, event.eventType, body, {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: event.eventType,
        timestamp: event.occurredAt.getTime(),
        headers: {
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          branchId: event.branchId
        }
      });

      await markOutboxEventPublished(event.id);
      published += 1;
    } catch (error) {
      await markOutboxEventFailed(event.id, error);
      logger.error('Failed to publish outbox event', { eventId: event.eventId, error });
    }
  }

  return published;
}

export async function shutdownOutboxPublisher(): Promise<void> {
  try {
    if (channel) await channel.close();
  } finally {
    channel = null;
  }

  try {
    if (connection) await connection.close();
  } finally {
    connection = null;
  }
}
