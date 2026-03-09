import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env';
import apiRoutes from './routes';
import { ok } from './utils/response';
import { errorMiddleware } from './middleware/error';
import { notFound } from './middleware/not-found';

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

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

app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes);

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
