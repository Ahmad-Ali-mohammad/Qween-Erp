import { app } from './app';
import { connectWithRetry, disconnectDb } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { shutdownPrintingQueue } from './modules/printing/queue';
import { shutdownSyncQueue } from './modules/sync/queue';
import { captureObservedException, flushSentry, initializeSentry } from './observability/sentry';

let shuttingDown = false;

async function start() {
  initializeSentry();
  await connectWithRetry();
  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

async function shutdown(exitCode: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await shutdownPrintingQueue();
    await shutdownSyncQueue();
    await disconnectDb();
  } catch (error) {
    logger.error('Shutdown failed', { error });
    captureObservedException(error, {
      tags: {
        layer: 'server',
        phase: 'shutdown'
      }
    });
  } finally {
    await flushSentry();
    process.exit(exitCode);
  }
}

function handleFatalError(error: unknown, source: string) {
  logger.error('Fatal process error', { source, error });
  captureObservedException(error, {
    tags: {
      layer: 'process',
      source
    }
  });
  void shutdown(1);
}

start().catch((error) => {
  logger.error('Failed to start server', { error });
  captureObservedException(error, {
    tags: {
      layer: 'server',
      phase: 'startup'
    }
  });
  void shutdown(1);
});

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

process.on('uncaughtException', (error) => {
  handleFatalError(error, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  handleFatalError(reason, 'unhandledRejection');
});
