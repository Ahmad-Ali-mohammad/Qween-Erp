import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { env } from '../config/env';

const METRIC_PREFIX = 'erp_qween_';

export const metricsRegistry = new Registry();

if (env.metricsEnabled) {
  collectDefaultMetrics({
    register: metricsRegistry,
    prefix: METRIC_PREFIX
  });
}

const httpRequestsTotal = new Counter({
  name: `${METRIC_PREFIX}http_requests_total`,
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry]
});

const httpRequestDurationSeconds = new Histogram({
  name: `${METRIC_PREFIX}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

const syncBatchesTotal = new Counter({
  name: `${METRIC_PREFIX}sync_batches_total`,
  help: 'Total sync batches by execution mode and outcome',
  labelNames: ['mode', 'result'] as const,
  registers: [metricsRegistry]
});

const syncQueueJobsTotal = new Counter({
  name: `${METRIC_PREFIX}sync_queue_jobs_total`,
  help: 'Total sync queue jobs by state',
  labelNames: ['state'] as const,
  registers: [metricsRegistry]
});

function normalizeRoute(pathname: string): string {
  return pathname
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, '/:id');
}

function resolveRoute(req: Request): string {
  const routePath =
    typeof req.route?.path === 'string'
      ? `${req.baseUrl || ''}${req.route.path}`
      : (req.originalUrl.split('?')[0] || req.path || '/');

  return normalizeRoute(routePath || '/');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!env.metricsEnabled) {
    next();
    return;
  }

  const timer = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: resolveRoute(req),
      status_code: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    timer(labels);
  });

  next();
}

export function recordSyncBatch(mode: 'inline' | 'queued' | 'fallback', result: 'applied' | 'accepted' | 'failed'): void {
  if (!env.metricsEnabled) return;
  syncBatchesTotal.inc({ mode, result });
}

export function recordSyncQueueJobState(state: 'completed' | 'failed'): void {
  if (!env.metricsEnabled) return;
  syncQueueJobsTotal.inc({ state });
}

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}
