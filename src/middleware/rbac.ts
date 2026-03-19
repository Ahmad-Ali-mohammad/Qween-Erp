import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types/auth';
import { fail } from '../utils/response';
import { ERROR_CODES } from '../constants/error-codes';

export function buildPermissionKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

export function hasPermission(req: AuthRequest, permission: string): boolean {
  return req.user?.permissions?.[permission] === true;
}

export function requirePermissions(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      fail(res, ERROR_CODES.UNAUTHORIZED, 'غير مصرح', 401);
      return;
    }

    const allowed = permissions.every((perm) => hasPermission(req, perm));
    if (!allowed) {
      fail(res, ERROR_CODES.FORBIDDEN, 'ليس لديك صلاحية لهذا الإجراء', 403);
      return;
    }

    next();
  };
}

export function checkPermission(resource: string, action: string) {
  return requirePermissions(buildPermissionKey(resource, action));
}
