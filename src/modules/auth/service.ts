import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Errors } from '../../utils/response';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';

const LOCK_MINUTES = 15;
const MAX_FAILED = 5;
const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_PREFIX = 'password-reset:';

function passwordResetKey(userId: number) {
  return `${PASSWORD_RESET_PREFIX}${userId}`;
}

function hashResetTokenSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

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

export async function requestPasswordReset(username: string) {
  const normalizedUsername = String(username ?? '').trim();
  if (!normalizedUsername) throw Errors.validation('اسم المستخدم مطلوب');

  const accepted = {
    accepted: true,
    message: 'تم استلام طلب إعادة التعيين'
  } as { accepted: true; message: string; resetToken?: string };

  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user || !user.isActive) return accepted;

  const tokenId = randomUUID();
  const tokenSecret = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await prisma.integrationSetting.upsert({
    where: { key: passwordResetKey(user.id) },
    update: {
      provider: 'auth',
      isEnabled: true,
      status: 'PENDING',
      settings: {
        tokenId,
        tokenHash: hashResetTokenSecret(tokenSecret),
        expiresAt: expiresAt.toISOString()
      }
    },
    create: {
      key: passwordResetKey(user.id),
      provider: 'auth',
      isEnabled: true,
      status: 'PENDING',
      settings: {
        tokenId,
        tokenHash: hashResetTokenSecret(tokenSecret),
        expiresAt: expiresAt.toISOString()
      }
    }
  });

  if (env.nodeEnv === 'test') {
    accepted.resetToken = `${tokenId}.${tokenSecret}`;
  }

  return accepted;
}

export async function resetPassword(username: string, token: string, newPassword: string) {
  const normalizedUsername = String(username ?? '').trim();
  const normalizedToken = String(token ?? '').trim();
  const normalizedPassword = String(newPassword ?? '').trim();

  if (!normalizedUsername || !normalizedToken || normalizedPassword.length < 6) {
    throw Errors.validation('بيانات إعادة التعيين غير مكتملة');
  }

  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user) throw Errors.notFound('المستخدم غير موجود');

  const [tokenId, tokenSecret] = normalizedToken.split('.', 2);
  if (!tokenId || !tokenSecret) throw Errors.validation('رمز إعادة التعيين غير صالح');

  const resetRequest = await prisma.integrationSetting.findUnique({ where: { key: passwordResetKey(user.id) } });
  const settings = (resetRequest?.settings ?? {}) as Record<string, unknown>;
  const expiresAt = new Date(String(settings.expiresAt ?? ''));
  const tokenHash = String(settings.tokenHash ?? '');

  if (!resetRequest || !resetRequest.isEnabled || String(settings.tokenId ?? '') !== tokenId || tokenHash !== hashResetTokenSecret(tokenSecret)) {
    throw Errors.unauthorized('رمز إعادة التعيين غير صالح');
  }

  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    await prisma.integrationSetting.deleteMany({ where: { key: passwordResetKey(user.id) } });
    throw Errors.unauthorized('رمز إعادة التعيين منتهي الصلاحية');
  }

  const password = await bcrypt.hash(normalizedPassword, env.bcryptRounds);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password, failedLoginCount: 0, lockedUntil: null }
    });
    await tx.integrationSetting.deleteMany({ where: { key: passwordResetKey(user.id) } });
  });

  return { reset: true };
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
