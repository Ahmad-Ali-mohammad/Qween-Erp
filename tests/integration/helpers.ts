import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { PERMISSIONS } from '../../src/constants/permissions';

export async function ensureAdminUser(): Promise<void> {
  const allPermissions: Record<string, boolean> = Object.values(PERMISSIONS).reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {} as Record<string, boolean>);

  const role = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      nameAr: 'مدير النظام',
      permissions: allPermissions as unknown as object,
      isSystem: true
    },
    create: {
      name: 'admin',
      nameAr: 'مدير النظام',
      description: 'صلاحيات كاملة',
      permissions: allPermissions as unknown as object,
      isSystem: true
    }
  });

  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@erp.local',
      fullName: 'System Admin',
      password,
      roleId: role.id,
      isActive: true
    },
    create: {
      username: 'admin',
      email: 'admin@erp.local',
      fullName: 'System Admin',
      password,
      roleId: role.id,
      isActive: true
    }
  });
}

export async function loginAdmin(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body.data.token as string;
}

export function uniqueCode(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
