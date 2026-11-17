import { app } from './app';
import { connectWithRetry, disconnectDb } from './config/database';
import { logger } from './config/logger';
import service from './service.mjs';
import { startOutboxWorker, stopOutboxWorker } from './platform/events/worker';

async function start() {
  await connectWithRetry();
  startOutboxWorker();
  const port = service.port();
  app.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on port ${port}`);
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
