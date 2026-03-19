import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { loginSchema, refreshSchema, registerSchema } from './dto';
import * as service from './service';
import { ok } from '../../utils/response';
import { prisma } from '../../config/database';

const router = Router();

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const result = await service.register(req.body);
    ok(res, result, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await service.login(req.body.username, req.body.password);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (_req, res, next) => {
  try {
    const result = await service.requestPasswordReset();
    ok(res, result, undefined, 202);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const result = await service.resetPassword(req.body?.username, req.body?.newPassword);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const result = await service.refresh(req.body.refreshToken);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const result = await service.logout(req.body.refreshToken);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req: any, res) => {
  ok(res, req.user);
});

router.get('/permissions', authenticate, async (req: any, res) => {
  ok(res, {
    permissions: req.user?.permissions ?? {},
    branchIds: req.user?.branchIds ?? [],
    projectIds: req.user?.projectIds ?? [],
    warehouseIds: req.user?.warehouseIds ?? []
  });
});

router.get('/sessions', authenticate, async (_req, res) => {
  const sessions = await prisma.authSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, username: true, fullName: true } } },
    orderBy: { id: 'desc' }
  });
  ok(res, sessions);
});

router.get('/active-users', authenticate, async (_req, res) => {
  const rows = await prisma.authSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    distinct: ['userId'],
    select: { userId: true }
  });
  ok(res, { count: rows.length });
});

export default router;
