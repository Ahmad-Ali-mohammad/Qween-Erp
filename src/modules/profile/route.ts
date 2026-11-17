import { qw } from '../../utils/where';
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { ok, Errors } from '../../utils/response';

const router = Router();

async function changePassword(req: any, res: Response) {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  if (newPassword.length < 6) throw Errors.validation('كلمة المرور الجديدة قصيرة');

  const user = await prisma.orm.public.User.first((r) => qw(r, { id: Number(req.user.id) }));
  if (!user) throw Errors.notFound('المستخدم غير موجود');

  const matched = await bcrypt.compare(currentPassword, user.password);
  if (!matched) throw Errors.validation('كلمة المرور الحالية غير صحيحة');

  const password = await bcrypt.hash(newPassword, 10);
  await prisma.orm.public.User.where((r) => qw(r, { id: user.id })).update({ password }).then((r0) => r0!);
  ok(res, { changed: true });
}

router.use(authenticate);

router.get('/profile', async (req: any, res: Response) => {
  ok(res, await prisma.orm.public.User.include('role').first((r) => qw(r, { id: Number(req.user.id) })));
});

router.put('/profile', async (req: any, res: Response) => {
  const id = Number(req.user.id);
  ok(
    res,
    await prisma.orm.public.User.where((r) => qw(r, { id })).update({
        fullName: req.body?.fullName ?? undefined,
        email: req.body?.email ?? undefined,
        phone: req.body?.phone ?? undefined,
        position: req.body?.position ?? undefined
      }).then((r0) => r0!)
  );
});

router.post('/profile/change-password', changePassword);
router.post('/auth/change-password', changePassword);

router.post('/auth/enable-mfa', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: true, method: 'TOTP' }, update: { isEnabled: true, method: 'TOTP' }, conflictOn: { userId } });
  ok(res, row);
});

router.post('/auth/verify-mfa', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const token = String(req.body?.token ?? '');
  if (token.length < 4) throw Errors.validation('رمز MFA غير صالح');

  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: true, verifiedAt: new Date() }, update: { verifiedAt: new Date(), isEnabled: true }, conflictOn: { userId } });
  ok(res, row);
});

router.post('/auth/disable-mfa', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: false }, update: { isEnabled: false, method: null, secret: null }, conflictOn: { userId } });
  ok(res, row);
});

router.get('/profile/mfa', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const row = await prisma.orm.public.UserMfaSetting.first({ userId });
  ok(res, row ?? { userId, isEnabled: false });
});

router.post('/profile/mfa/enable', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: true, method: 'TOTP' }, update: { isEnabled: true, method: 'TOTP' }, conflictOn: { userId } });
  ok(res, row);
});

router.post('/profile/mfa/verify', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const token = String(req.body?.token ?? '');
  if (token.length < 4) throw Errors.validation('رمز MFA غير صالح');

  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: true, verifiedAt: new Date() }, update: { verifiedAt: new Date(), isEnabled: true }, conflictOn: { userId } });
  ok(res, row);
});

router.post('/profile/mfa/disable', async (req: any, res: Response) => {
  const userId = Number(req.user.id);
  const row = await prisma.orm.public.UserMfaSetting.upsert({ create: { userId, isEnabled: false }, update: { isEnabled: false, method: null, secret: null }, conflictOn: { userId } });
  ok(res, row);
});

router.get('/profile/preferences', async (req: any, res: Response) => {
  const key = `profile-preferences:${Number(req.user.id)}`;
  const row = await prisma.orm.public.IntegrationSetting.first({ key });
  ok(res, (row?.settings as Record<string, unknown>) ?? {});
});

router.put('/profile/preferences', async (req: any, res: Response) => {
  const key = `profile-preferences:${Number(req.user.id)}`;
  const row = await prisma.orm.public.IntegrationSetting.upsert({ create: { key, provider: 'SYSTEM', isEnabled: true, status: 'ACTIVE', settings: req.body ?? {} }, update: { settings: req.body ?? {}, provider: 'SYSTEM', isEnabled: true, status: 'ACTIVE' }, conflictOn: { key } });
  ok(res, row.settings ?? {});
});

export default router;
