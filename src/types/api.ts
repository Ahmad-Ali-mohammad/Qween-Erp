import type { ErrorCode } from '../constants/error-codes';

export interface ApiSuccess<T = unknown> {
  success: true;
  status: {
    code: string;
    message?: string;
  };
  data: T;
  meta?: Record<string, unknown>;
  validationErrors?: unknown;
  postingRefs?: unknown;
  auditRef?: number | null;
}

export interface ApiFailure {
  success: false;
  status: {
    code: string;
    message?: string;
  };
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  validationErrors?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;
