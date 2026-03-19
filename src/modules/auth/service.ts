import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Errors } from '../../utils/response';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';

const LOCK_MINUTES = 15;
const MAX_FAILED = 5;

type AuthPayload = {
  id: number;
  username: string;
  roleId: number;
};

type UserWithRole = {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  defaultBranchId?: number | null;
  role: {
    permissions: unknown;
  };
  branchAccesses?: Array<{ branchId: number }>;
  projectAccesses?: Array<{ projectId: number }>;
  warehouseAccesses?: Array<{ warehouseId: number }>;
};

function toPublicUser(user: UserWithRole) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    permissions: (user.role.permissions ?? {}) as Record<string, boolean>,
    defaultBranchId: user.defaultBranchId ?? null,
    branchIds: user.branchAccesses?.map((row) => row.branchId) ?? [],
    projectIds: user.projectAccesses?.map((row) => row.projectId) ?? [],
    warehouseIds: user.warehouseAccesses?.map((row) => row.warehouseId) ?? []
  };
}

async function createSession(user: UserWithRole) {
  const payload: AuthPayload = { id: user.id, username: user.username, roleId: user.roleId };
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
    user: toPublicUser(user)
  };
}

async function resolveRegistrationRole() {
  return prisma.role.upsert({
    where: { name: 'employee' },
    update: {
      nameAr: 'مستخدم أساسي',
      description: 'صلاحيات افتراضية للتسجيل الذاتي'
    },
    create: {
      name: 'employee',
      nameAr: 'مستخدم أساسي',
      description: 'صلاحيات افتراضية للتسجيل الذاتي',
      permissions: {}
    }
  });
}

export async function register(input: {
  username: string;
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  position?: string;
}) {
  const exists = await prisma.user.findFirst({
    where: {
      OR: [{ username: input.username }, { email: input.email }]
    }
  });
  if (exists) throw Errors.conflict('اسم المستخدم أو البريد موجود بالفعل');

  const role = await resolveRegistrationRole();
  const password = await bcrypt.hash(input.password, env.bcryptRounds);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      fullName: input.fullName,
      password,
      phone: input.phone,
      position: input.position,
      roleId: role.id
    },
    include: {
      role: true,
      branchAccesses: { select: { branchId: true } },
      projectAccesses: { select: { projectId: true } },
      warehouseAccesses: { select: { warehouseId: true } }
    }
  });

  return createSession(user as UserWithRole);
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      role: true,
      branchAccesses: { select: { branchId: true } },
      projectAccesses: { select: { projectId: true } },
      warehouseAccesses: { select: { warehouseId: true } }
    }
  });
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

  return createSession(user as UserWithRole);
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

  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user) throw Errors.notFound('المستخدم غير موجود');

  const password = await bcrypt.hash(normalizedPassword, env.bcryptRounds);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password,
      failedLoginCount: 0,
      lockedUntil: null
    }
  });

  return { reset: true };
}

export async function refresh(refreshToken: string) {
  const session = await prisma.authSession.findUnique({ where: { refreshToken }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw Errors.unauthorized('Refresh token غير صالح');
  }

  const decoded = jwt.verify(refreshToken, env.jwtSecret) as { id: number; username: string; roleId: number };
  const token = signAccessToken({ id: decoded.id, username: decoded.username, roleId: decoded.roleId });
  return { token };
}

export async function logout(refreshToken: string) {
  const session = await prisma.authSession.findUnique({ where: { refreshToken } });
  if (session) {
    await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  }
  return { message: 'تم تسجيل الخروج' };
}
