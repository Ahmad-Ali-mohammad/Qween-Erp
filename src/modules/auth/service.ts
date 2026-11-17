import bcrypt from 'bcryptjs';
import { qw } from '../../utils/where';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Errors } from '../../utils/response';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';

const LOCK_MINUTES = 15;
const MAX_FAILED = 5;

export async function login(username: string, password: string) {
  const user = await prisma.orm.public.User.include('role').first({ username });
  if (!user || !user.isActive) throw Errors.unauthorized('بيانات الدخول غير صحيحة');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw Errors.forbidden('الحساب مقفل مؤقتًا بسبب محاولات فاشلة متعددة');
  }

  const matched = await bcrypt.compare(password, user.password);

  if (!matched) {
    const failed = user.failedLoginCount + 1;
    await prisma.orm.public.User.where((r) => qw(r, { id: user.id })).update({
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null
      }).then((r0) => r0!);
    throw Errors.unauthorized('بيانات الدخول غير صحيحة');
  }

  await prisma.orm.public.User.where((r) => qw(r, { id: user.id })).update({ failedLoginCount: 0, lockedUntil: null, lastLogin: new Date() }).then((r0) => r0!);

  const payload = { id: user.id, username: user.username, roleId: user.roleId };
  const token = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await prisma.orm.public.AuthSession.create({
      userId: user.id,
      refreshToken,
      expiresAt
    });

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      permissions: user.role.permissions
    }
  };
}

export async function requestPasswordReset() {
  return {
    accepted: true,
    message: 'تم استلام طلب إعادة التعيين'
  };
}

export async function resetPassword(username: string, newPassword: string) {
  const normalizedUsername = String(username ?? '').trim();
  const normalizedPassword = String(newPassword ?? '').trim();

  if (!normalizedUsername || normalizedPassword.length < 6) {
    throw Errors.validation('بيانات إعادة التعيين غير مكتملة');
  }

  const user = await prisma.orm.public.User.first({ username: normalizedUsername });
  if (!user) throw Errors.notFound('المستخدم غير موجود');

  const password = await bcrypt.hash(normalizedPassword, env.bcryptRounds);
  await prisma.orm.public.User.where((r) => qw(r, { id: user.id })).update({ password, failedLoginCount: 0, lockedUntil: null }).then((r0) => r0!);

  return { reset: true };
}

export async function refresh(refreshToken: string) {
  const session = await prisma.orm.public.AuthSession.include('user').first({ refreshToken });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw Errors.unauthorized('Refresh token غير صالح');
  }

  const decoded = jwt.verify(refreshToken, env.jwtSecret) as { id: number; username: string; roleId: number };
  const token = signAccessToken(decoded);
  return { token };
}

export async function logout(refreshToken: string) {
  const session = await prisma.orm.public.AuthSession.first({ refreshToken });
  if (session) {
    await prisma.orm.public.AuthSession.where((r) => qw(r, { id: session.id })).update({ revokedAt: new Date() }).then((r0) => r0!);
  }
  return { message: 'تم تسجيل الخروج' };
}
