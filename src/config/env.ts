import dotenv from 'dotenv';
import service from '../service.mjs';

dotenv.config();

const { jwtSecret } = service.input();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: jwtSecret.expose(),
  jwtExpire: process.env.JWT_EXPIRE ?? '24h',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  rateLimitWindow: Number(process.env.RATE_LIMIT_WINDOW ?? 15),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 150),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logFilePath: process.env.LOG_FILE_PATH ?? './logs',
  rabbitMqEnabled: String(process.env.RABBITMQ_ENABLED ?? 'false').toLowerCase() === 'true',
  rabbitMqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  rabbitMqExchange: process.env.RABBITMQ_EXCHANGE ?? 'erp.events',
  rabbitMqPrefetch: Number(process.env.RABBITMQ_PREFETCH ?? 20),
  outboxPollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000),
  outboxBatchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 25),
  objectStorageProvider: process.env.OBJECT_STORAGE_PROVIDER ?? 'local',
  objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
  objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET ?? 'erp-documents',
  objectStorageRegion: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
  objectStorageForcePathStyle: String(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() === 'true',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-5.4',
  assistantMaxOutputTokens: Number(process.env.ASSISTANT_MAX_OUTPUT_TOKENS ?? 450)
};
