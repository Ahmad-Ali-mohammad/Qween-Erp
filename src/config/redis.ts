import { env } from './env';

export function isRedisConfigured(): boolean {
  return Boolean(env.redisUrl);
}

export function isBullMqConfigured(): boolean {
  return env.bullmqEnabled && isRedisConfigured();
}

export function createRedisConnectionOptions(connectionName: string) {
  if (!isBullMqConfigured()) return null;

  return {
    url: env.redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectionName
  } as const;
}
