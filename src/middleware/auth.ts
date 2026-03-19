import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AuthRequest } from '../types/auth';
import { ERROR_CODES } from '../constants/error-codes';
import { fail } from '../utils/response';

type TokenPayload = {
  id: number;
  username: string;
  roleId: number;
};

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpire as any });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtRefreshExpire as any, jwtid: randomUUID() });
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    fail(res, ERROR_CODES.UNAUTHORIZED, 'غير مصرح - الرجاء تسجيل الدخول', 401);
    return;
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        role: true,
        branchAccesses: { select: { branchId: true, canRead: true, canWrite: true } },
        projectAccesses: { select: { projectId: true, canRead: true, canWrite: true } },
        warehouseAccesses: { select: { warehouseId: true, canRead: true, canWrite: true } }
      }
    });

    if (!user || !user.isActive) {
      fail(res, ERROR_CODES.UNAUTHORIZED, 'المستخدم غير نشط أو غير موجود', 401);
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      roleId: user.roleId,
      permissions: (user.role.permissions ?? {}) as Record<string, boolean>,
      defaultBranchId: (user as any).defaultBranchId ?? null,
      branchIds: user.branchAccesses.filter((row) => row.canRead || row.canWrite).map((row) => row.branchId),
      branchWriteIds: user.branchAccesses.filter((row) => row.canWrite).map((row) => row.branchId),
      projectIds: user.projectAccesses.filter((row) => row.canRead || row.canWrite).map((row) => row.projectId),
      projectWriteIds: user.projectAccesses.filter((row) => row.canWrite).map((row) => row.projectId),
      warehouseIds: user.warehouseAccesses.filter((row) => row.canRead || row.canWrite).map((row) => row.warehouseId),
      warehouseWriteIds: user.warehouseAccesses.filter((row) => row.canWrite).map((row) => row.warehouseId)
    };

    next();
  } catch {
    fail(res, ERROR_CODES.UNAUTHORIZED, 'انتهت صلاحية الجلسة', 401);
  }
}
