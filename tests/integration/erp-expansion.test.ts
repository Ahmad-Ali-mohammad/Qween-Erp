import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { PERMISSIONS } from '../../src/constants/permissions';
import { ensureAdminUser, loginAdmin } from './helpers';

describe('ERP expansion APIs', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('rejects unknown fields in create payload (mass-assignment guard)', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'IT-MASS-001',
        nameAr: 'اختبار تحقق',
        isActive: true,
        hackedField: 'x'
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('enforces reports.advanced.write for scheduled reports create', async () => {
    const roleName = `qa_readonly_${Date.now()}`;
    const username = `qa_user_${Date.now()}`;
    const password = 'QaTest!234';

    const permissions: Record<string, boolean> = Object.values(PERMISSIONS).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as Record<string, boolean>);
    permissions[PERMISSIONS.REPORTS_ADVANCED_READ] = true;

    const role = await prisma.role.create({
      data: {
        name: roleName,
        nameAr: 'قارئ تقارير متقدمة',
        permissions
      }
    });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        fullName: 'QA User',
        password: hashed,
        roleId: role.id
      }
    });

    const tokenRes = await request(app).post('/api/auth/login').send({ username, password });
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.data.token as string;

    const readRes = await request(app).get('/api/scheduled-reports').set('Authorization', `Bearer ${token}`);
    expect(readRes.status).toBe(200);

    const writeRes = await request(app)
      .post('/api/scheduled-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'تقرير أسبوعي',
        reportType: 'trial-balance',
        schedule: '0 8 * * 1'
      });

    expect(writeRes.status).toBe(403);

    await prisma.user.delete({ where: { username } });
    await prisma.role.delete({ where: { id: role.id } });
  });

  it('returns Arabic message in year-close opening entry', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/year-close/opening-entry')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('قيد');
    expect(res.body.data.message).not.toMatch(/[ÃØÙï¿½]/);
  });
});
