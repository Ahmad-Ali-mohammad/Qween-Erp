import { NextFunction, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types/auth';

export function audit(tableName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = ((body: any) => {
      if (res.statusCode < 400 && req.method !== 'GET') {
        prisma.auditLog.create({
          data: {
            userId: req.user?.id,
            table: tableName,
            recordId: body?.data?.id ? Number(body.data.id) : req.params.id ? Number(req.params.id) : null,
            action: req.method,
            oldValue: undefined,
            newValue: body?.data ?? undefined,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? null
          }
        }).catch(() => undefined);
      }
      return originalJson(body);
    }) as any;

    next();
  };
}
