import { Request, Response } from 'express';
import { fail } from '../utils/response';
import { ERROR_CODES } from '../constants/error-codes';

export function notFound(_req: Request, res: Response): void {
  fail(res, ERROR_CODES.NOT_FOUND, 'المسار غير موجود', 404);
}
