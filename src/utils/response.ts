import type { Response } from 'express';
import type { ApiFailure, ApiSuccess } from '../types/api';
import { ERROR_CODES, type ErrorCode } from '../constants/error-codes';

type SuccessEnvelope = {
  status?: {
    code: string;
    message?: string;
  };
  validationErrors?: unknown;
  postingRefs?: unknown;
  auditRef?: number | null;
};

export function ok<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>,
  status = 200,
  envelope?: SuccessEnvelope
): Response<ApiSuccess<T>> {
  return res.status(status).json({
    success: true,
    status: envelope?.status ?? { code: 'OK' },
    data,
    ...(meta ? { meta } : {}),
    ...(envelope?.validationErrors !== undefined ? { validationErrors: envelope.validationErrors } : {}),
    ...(envelope?.postingRefs !== undefined ? { postingRefs: envelope.postingRefs } : {}),
    ...(envelope?.auditRef !== undefined ? { auditRef: envelope.auditRef } : {})
  });
}

export function fail(
  res: Response,
  code: ErrorCode,
  message: string,
  status = 400,
  details?: unknown
): Response<ApiFailure> {
  return res.status(status).json({
    success: false,
    status: { code, message },
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    ...(code === ERROR_CODES.VALIDATION_ERROR ? { validationErrors: details } : {})
  });
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (message = 'غير مصرح') => new AppError(ERROR_CODES.UNAUTHORIZED, message, 401),
  forbidden: (message = 'ليس لديك صلاحية') => new AppError(ERROR_CODES.FORBIDDEN, message, 403),
  notFound: (message = 'غير موجود') => new AppError(ERROR_CODES.NOT_FOUND, message, 404),
  conflict: (message = 'تعارض في البيانات') => new AppError(ERROR_CODES.CONFLICT, message, 409),
  validation: (message = 'بيانات غير صالحة', details?: unknown) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, message, 422, details),
  business: (message = 'مخالفة قاعدة عمل', details?: unknown) =>
    new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message, 400, details),
  internal: (message = 'خطأ داخلي') => new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, message, 500)
};
