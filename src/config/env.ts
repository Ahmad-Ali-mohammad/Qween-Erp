import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://erp_user:erp_pass@localhost:5432/erp_qween?schema=public'),
  jwtSecret: requireEnv('JWT_SECRET', 'change-me'),
  jwtExpire: process.env.JWT_EXPIRE ?? '24h',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  rateLimitWindow: Number(process.env.RATE_LIMIT_WINDOW ?? 15),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 150),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logFilePath: process.env.LOG_FILE_PATH ?? './logs',
  metricsEnabled: process.env.METRICS_ENABLED !== 'false',
  metricsToken: process.env.METRICS_TOKEN ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  bullmqEnabled: process.env.BULLMQ_ENABLED === 'true' || process.env.ENABLE_QUEUE === 'true',
  syncQueueName: process.env.SYNC_QUEUE_NAME ?? 'sync-batches',
  syncQueueConcurrency: Number(process.env.SYNC_QUEUE_CONCURRENCY ?? 2),
  syncQueueAttempts: Number(process.env.SYNC_QUEUE_ATTEMPTS ?? 3),
  appTimezone: process.env.APP_TIMEZONE ?? 'Asia/Kuwait',
  appLocale: process.env.APP_LOCALE ?? 'ar-KW',
  baseCurrency: process.env.BASE_CURRENCY ?? 'KWD'
};
