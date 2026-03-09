import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { existsSync } from 'fs';
import path from 'path';
import { env } from './config/env';
import apiRoutes from './routes';
import { ok } from './utils/response';
import { errorMiddleware } from './middleware/error';
import { notFound } from './middleware/not-found';
import { getMetricsContentType, metricsMiddleware, renderMetrics } from './observability/metrics';
import { CENTRAL_SYSTEMS } from './modules/central/catalog';

export const app = express();

function mountWorkspaceFrontends() {
  for (const system of CENTRAL_SYSTEMS) {
    const distDir = path.join(process.cwd(), 'apps', system.appDir, 'dist');
    const indexFile = path.join(distDir, 'index.html');

    if (!existsSync(indexFile)) {
      continue;
    }

    app.use(system.routeBase, express.static(distDir, { redirect: false }));

    app.get(system.routeBase, (_req, res) => {
      res.sendFile(indexFile);
    });

    app.get(`${system.routeBase}/*`, (_req, res) => {
      res.sendFile(indexFile);
    });
  }
}

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(metricsMiddleware);

const limiter = rateLimit({
  windowMs: env.rateLimitWindow * 60 * 1000,
  max: (req) => {
    const base = env.nodeEnv === 'development' ? Math.max(env.rateLimitMax, 2000) : env.rateLimitMax;
    const hasBearer = String(req.headers.authorization || '').startsWith('Bearer ');
    if (hasBearer) return Math.max(base, 1000);
    return base;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfterSeconds = Math.max(1, Math.ceil((env.rateLimitWindow * 60 * 1000) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Retry after ${retryAfterSeconds}s`
      }
    });
  }
});
app.use('/api', limiter);

const healthHandler = (_req: express.Request, res: express.Response) => {
  ok(res, {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    uptime: process.uptime(),
    timezone: env.appTimezone,
    locale: env.appLocale,
    baseCurrency: env.baseCurrency
  });
};

app.get('/api/health', healthHandler);
app.get('/api/v1/health', healthHandler);

const metricsHandler = async (req: express.Request, res: express.Response) => {
  if (!env.metricsEnabled) {
    res.status(404).json({
      success: false,
      status: {
        code: 'NOT_FOUND',
        message: 'Metrics endpoint is disabled'
      },
      error: {
        code: 'NOT_FOUND',
        message: 'Metrics endpoint is disabled'
      }
    });
    return;
  }

  if (env.metricsToken) {
    const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const headerToken = String(req.headers['x-metrics-token'] || '');

    if (bearerToken !== env.metricsToken && headerToken !== env.metricsToken) {
      res.status(401).json({
        success: false,
        status: {
          code: 'UNAUTHORIZED',
          message: 'Metrics token is required'
        },
        error: {
          code: 'UNAUTHORIZED',
          message: 'Metrics token is required'
        }
      });
      return;
    }
  }

  res.setHeader('Content-Type', getMetricsContentType());
  res.send(await renderMetrics());
};

app.get('/api/metrics', metricsHandler);
app.get('/api/v1/metrics', metricsHandler);

app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes);

mountWorkspaceFrontends();

app.get('/', (_req, res) => {
  res.redirect(302, '/portal');
});
app.use(express.static(path.join(process.cwd(), 'frontend')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(process.cwd(), 'frontend/index.html'));
});

app.use(notFound);
app.use(errorMiddleware);
