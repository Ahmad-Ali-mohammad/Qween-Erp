import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { AppError, fail } from '../utils/response';
import { ERROR_CODES } from '../constants/error-codes';

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    fail(res, error.code, error.message, error.status, error.details);
    return;
  }

  logger.error('Unhandled error', { error });
  fail(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 'حدث خطأ داخلي غير متوقع', 500);
}
