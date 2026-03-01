import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Errors } from '../../utils/response';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';

const LOCK_MINUTES = 15;
const MAX_FAILED = 5;

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username }, include: { role: true } });
  if (!user || !user.isActive) throw Errors.unauthorized('بيانات الدخول غير صحيحة');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw Errors.forbidden('الحساب مقفل مؤقتًا بسبب محاولات فاشلة متعددة');
  }

  const matched = await bcrypt.compare(password, user.password);

  if (!matched) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null
      }
    });
    throw Errors.unauthorized('بيانات الدخول غير صحيحة');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLogin: new Date() }
  });

  const payload = { id: user.id, username: user.username, roleId: user.roleId };
  const token = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt
    }
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

export async function refresh(refreshToken: string) {
  const session = await prisma.authSession.findUnique({ where: { refreshToken }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw Errors.unauthorized('Refresh token غير صالح');
  }

  const decoded = jwt.verify(refreshToken, env.jwtSecret) as { id: number; username: string; roleId: number };
  const token = signAccessToken(decoded);
  return { token };
}

export async function logout(refreshToken: string) {
  const session = await prisma.authSession.findUnique({ where: { refreshToken } });
  if (session) {
    await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  }
  return { message: 'تم تسجيل الخروج' };
}
