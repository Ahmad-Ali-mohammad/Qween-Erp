import { app } from './app';
import { connectWithRetry, disconnectDb } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { startOutboxWorker, stopOutboxWorker } from './platform/events/worker';

async function start() {
  await connectWithRetry();
  startOutboxWorker();
  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

process.on('SIGINT', async () => {
  await stopOutboxWorker();
  await disconnectDb();
  process.exit(0);
});
