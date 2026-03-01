import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types/auth';
import { fail } from '../utils/response';
import { ERROR_CODES } from '../constants/error-codes';

export function requirePermissions(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      fail(res, ERROR_CODES.UNAUTHORIZED, 'غير مصرح', 401);
      return;
    }

    const allowed = permissions.every((perm) => req.user?.permissions?.[perm] === true);
    if (!allowed) {
      fail(res, ERROR_CODES.FORBIDDEN, 'ليس لديك صلاحية لهذا الإجراء', 403);
      return;
    }

    next();
  };
}
