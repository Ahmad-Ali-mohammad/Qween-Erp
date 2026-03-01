import { NextFunction, Response } from 'express';
import { ZodSchema } from 'zod';
import { AuthRequest } from '../types/auth';
import { fail } from '../utils/response';
import { ERROR_CODES } from '../constants/error-codes';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      fail(res, ERROR_CODES.VALIDATION_ERROR, 'بيانات الطلب غير صالحة', 422, result.error.flatten());
      return;
    }
    req.body = result.data;
    next();
  };
}
