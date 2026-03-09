import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { forgotPasswordSchema, loginSchema, refreshSchema, resetPasswordSchema } from './dto';
import * as service from './service';
import { ok } from '../../utils/response';

const router = Router();

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await service.login(req.body.username, req.body.password);
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const result = await service.requestPasswordReset(req.body.username);
    ok(res, result, undefined, 202);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await service.resetPassword(req.body.username, req.body.token, req.body.newPassword);
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

export default router;
