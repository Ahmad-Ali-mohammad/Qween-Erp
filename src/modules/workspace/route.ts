import { qw } from '../../utils/where';
import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { Errors, ok } from '../../utils/response';

const router = Router();

function parsePositiveInt(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw Errors.validation(`${name} غير صالح`);
  }
  return parsed;
}

router.use(authenticate);

router.get('/notifications/count', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const unread = await prisma.orm.public.Notification.where((r) => qw(r, {
      OR: [{ userId }, { userId: null }],
      isRead: false
    })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
  ok(res, { unread });
});

router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'notificationId');
  ok(res, await prisma.orm.public.Notification.where((r) => qw(r, { id })).update({ isRead: true, readAt: new Date() }).then((r0) => r0!));
});

router.post('/notifications/read-all', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const result = await prisma.orm.public.Notification.where((r) => qw(r, {
      OR: [{ userId }, { userId: null }],
      isRead: false
    })).updateAndCount({ isRead: true, readAt: new Date() }).then((n0) => ({ count: n0 }));
  ok(res, { updated: result.count });
});

router.post('/tasks/:id/assign', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'taskId');
  const assignedTo = Number(req.body?.userId ?? 0) || null;
  ok(res, await prisma.orm.public.UserTask.where((r) => qw(r, { id })).update({ userId: assignedTo }).then((r0) => r0!));
});

router.patch('/tasks/:id/status', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'taskId');
  const status = String(req.body?.status ?? '').trim();
  if (!status) {
    throw Errors.validation('status مطلوب');
  }
  ok(res, await prisma.orm.public.UserTask.where((r) => qw(r, { id })).update({ status }).then((r0) => r0!));
});

export default router;
