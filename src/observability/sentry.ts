import * as Sentry from '@sentry/node';
import { env } from '../config/env';
import { logger } from '../config/logger';

let sentryInitialized = false;

function getTracesSampleRate(): number | undefined {
  const rate = env.sentryTracesSampleRate;
  if (rate <= 0) {
    return undefined;
  }

  return Math.min(rate, 1);
}

export function initializeSentry(): boolean {
  if (sentryInitialized || !env.sentryDsn) {
    return false;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: getTracesSampleRate()
  });

  sentryInitialized = true;
  logger.info('Sentry initialized', {
    environment: env.sentryEnvironment,
    tracesSampleRate: getTracesSampleRate() ?? 0
  });
  return true;
}

export function getSentryCapabilities() {
  return {
    configured: Boolean(env.sentryDsn),
    enabled: sentryInitialized && Sentry.isEnabled(),
    environment: env.sentryEnvironment,
    tracesSampleRate: getTracesSampleRate() ?? 0
  };
}

export function captureObservedException(
  error: unknown,
  options?: {
    tags?: Record<string, string>;
    extras?: Record<string, unknown>;
    user?: Record<string, string>;
  }
): void {
  if (!sentryInitialized || !Sentry.isEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    if (options?.tags) {
      scope.setTags(options.tags);
    }

    if (options?.extras) {
      scope.setExtras(options.extras);
    }

    if (options?.user) {
      scope.setUser(options.user);
    }

    Sentry.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryInitialized || !Sentry.isEnabled()) {
    return;
  }

  await Sentry.close(timeoutMs);
}
