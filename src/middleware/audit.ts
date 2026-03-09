import { NextFunction, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types/auth';

export function audit(tableName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = ((body: any) => {
      if (res.statusCode < 400 && req.method !== 'GET') {
        const payload = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : body;

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
        })
          .then((entry) => {
            if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.auditRef === undefined) {
              payload.auditRef = entry.id;
            }
            return originalJson(payload);
          })
          .catch(() => originalJson(body));
        return res as any;
      }
      return originalJson(body);
    }) as any;

    next();
  };
}
