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
  const unread = await prisma.notification.count({
    where: {
      OR: [{ userId }, { userId: null }],
      isRead: false
    }
  });
  ok(res, { unread });
});

router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'notificationId');
  ok(res, await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } }));
});

router.post('/notifications/read-all', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const result = await prisma.notification.updateMany({
    where: {
      OR: [{ userId }, { userId: null }],
      isRead: false
    },
    data: { isRead: true, readAt: new Date() }
  });
  ok(res, { updated: result.count });
});

router.post('/tasks/:id/assign', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'taskId');
  const assignedTo = Number(req.body?.userId ?? 0) || null;
  ok(res, await prisma.userTask.update({ where: { id }, data: { userId: assignedTo } }));
});

router.patch('/tasks/:id/status', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'taskId');
  const status = String(req.body?.status ?? '').trim();
  if (!status) {
    throw Errors.validation('status مطلوب');
  }
  ok(res, await prisma.userTask.update({ where: { id }, data: { status } }));
});

export default router;
