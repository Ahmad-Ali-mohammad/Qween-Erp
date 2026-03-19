import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('API v1 org and numbering foundation', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('exposes /api/v1 foundation endpoints for org scopes and numbering', async () => {
    const token = await loginAdmin();
    const suffix = uniqueCode('ORG');

    const healthRes = await request(app).get('/api/v1/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.timezone).toBe('Asia/Kuwait');
    expect(healthRes.body.data.baseCurrency).toBe('KWD');

    const branchRes = await request(app)
      .post('/api/v1/org/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BR-${suffix}`.slice(0, 30),
        nameAr: 'الفرع الرئيسي',
        nameEn: 'Main Branch',
        numberingPrefix: 'KWT'
      });

    expect(branchRes.status).toBe(201);
    expect(branchRes.body.success).toBe(true);
    expect(branchRes.body.status.code).toBe('OK');
    expect(typeof branchRes.body.auditRef).toBe('number');
    const branchId = Number(branchRes.body.data.id);

    const siteRes = await request(app)
      .post('/api/v1/org/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        code: `SITE-${suffix}`.slice(0, 30),
        nameAr: 'موقع المشروع',
        nameEn: 'Project Site'
      });

    expect(siteRes.status).toBe(201);
    const siteId = Number(siteRes.body.data.id);

    const departmentRes = await request(app)
      .post('/api/v1/org/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `DEP-${suffix}`.slice(0, 30),
        nameAr: 'إدارة المشاريع',
        branchId
      });

    expect(departmentRes.status).toBe(201);
    const departmentId = Number(departmentRes.body.data.id);

    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    expect(adminRole).toBeTruthy();

    const username = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `${username}@erp.local`;

    const userRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        email,
        fullName: 'Scoped User',
        password: 'pass1234',
        roleId: adminRole!.id,
        defaultBranchId: branchId
      });

    expect(userRes.status).toBe(201);
    const userId = Number(userRes.body.data.id);

    const scopesRes = await request(app)
      .put(`/api/v1/org/users/${userId}/scopes`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        defaultBranchId: branchId,
        branchAccesses: [{ branchId, canRead: true, canWrite: true }]
      });

    expect(scopesRes.status).toBe(200);
    expect(scopesRes.body.data.user.defaultBranchId).toBe(branchId);
    expect(scopesRes.body.data.branchAccesses).toHaveLength(1);
    expect(typeof scopesRes.body.auditRef).toBe('number');

    const bootstrapRes = await request(app)
      .get('/api/v1/org/bootstrap')
      .set('Authorization', `Bearer ${token}`);

    expect(bootstrapRes.status).toBe(200);
    expect(bootstrapRes.body.data.branches.some((row: { id: number }) => row.id === branchId)).toBe(true);
    expect(bootstrapRes.body.data.sites.some((row: { id: number }) => row.id === siteId)).toBe(true);
    expect(bootstrapRes.body.data.departments.some((row: { id: number }) => row.id === departmentId)).toBe(true);

    const previewRes = await request(app)
      .get('/api/v1/settings/numbering/preview')
      .set('Authorization', `Bearer ${token}`)
      .query({ documentType: 'PR', branchId });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.nextValue).toBe(1);
    expect(String(previewRes.body.data.previewNumber)).toContain('PR-KWT');

    const nextRes = await request(app)
      .post('/api/v1/settings/numbering/next')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentType: 'PR', branchId });

    expect(nextRes.status).toBe(201);
    expect(nextRes.body.data.currentValue).toBe(1);
    expect(String(nextRes.body.data.number)).toContain('PR-KWT');
    expect(typeof nextRes.body.auditRef).toBe('number');

    const listRes = await request(app)
      .get('/api/v1/settings/numbering')
      .set('Authorization', `Bearer ${token}`)
      .query({ documentType: 'PR', branchId });

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].currentValue).toBe(1);

    await prisma.userBranchAccess.deleteMany({ where: { userId } });
    await prisma.userProjectAccess.deleteMany({ where: { userId } });
    await prisma.userWarehouseAccess.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.numberSequence.deleteMany({ where: { branchId, documentType: 'PR' } });
    await prisma.department.delete({ where: { id: departmentId } });
    await prisma.site.delete({ where: { id: siteId } });
    await prisma.branch.delete({ where: { id: branchId } });
  });
});
