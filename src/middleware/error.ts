import { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '../constants/error-codes';
import { logger } from '../config/logger';
import { captureObservedException } from '../observability/sentry';
import type { AuthRequest } from '../types/auth';
import { AppError, fail } from '../utils/response';

export function errorMiddleware(error: unknown, rawRequest: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    fail(res, error.code, error.message, error.status, error.details);
    return;
  }

  const request = rawRequest as AuthRequest;

  captureObservedException(error, {
    tags: {
      layer: 'http',
      method: request.method,
      path: request.route?.path ? String(request.route.path) : request.path
    },
    extras: {
      originalUrl: request.originalUrl,
      params: request.params,
      query: request.query
    },
    user: request.user
      ? {
          id: String(request.user.id),
          username: request.user.username,
          roleId: String(request.user.roleId)
        }
      : undefined
  });

  logger.error('Unhandled error', { error });
  fail(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 'حدث خطأ داخلي غير متوقع', 500);
}
