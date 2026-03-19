import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('HR payroll branch scopes v1', () => {
  let adminToken = '';

  beforeAll(async () => {
    await ensureAdminUser();
    adminToken = await loginAdmin();
  });

  it('filters and blocks payroll runs by branch scope', async () => {
    let branchAId = 0;
    let branchBId = 0;
    let employeeAId = 0;
    let employeeBId = 0;
    let payrollRunAId = 0;
    let payrollRunBId = 0;
    let payrollLineAId = 0;
    let payrollLineBId = 0;
    let scopedUserId = 0;

    try {
      const branchA = await prisma.branch.create({
        data: { code: uniqueCode('BR-PA'), nameAr: 'فرع رواتب ألف' }
      });
      branchAId = branchA.id;

      const branchB = await prisma.branch.create({
        data: { code: uniqueCode('BR-PB'), nameAr: 'فرع رواتب باء' }
      });
      branchBId = branchB.id;

      const employeeA = await prisma.employee.create({
        data: {
          code: uniqueCode('EMP-PA'),
          fullName: 'موظف رواتب ألف',
          branchId: branchAId,
          status: 'ACTIVE',
          baseSalary: 1000,
          allowances: 100
        }
      });
      employeeAId = employeeA.id;

      const employeeB = await prisma.employee.create({
        data: {
          code: uniqueCode('EMP-PB'),
          fullName: 'موظف رواتب باء',
          branchId: branchBId,
          status: 'ACTIVE',
          baseSalary: 1200,
          allowances: 150
        }
      });
      employeeBId = employeeB.id;

      const payrollARes = await request(app)
        .post('/api/v1/hr/payroll/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ year: 2026, month: 7, branchId: branchAId });
      expect(payrollARes.status).toBe(201);
      payrollRunAId = Number(payrollARes.body.data.id);

      const payrollBRes = await request(app)
        .post('/api/v1/hr/payroll/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ year: 2026, month: 8, branchId: branchBId });
      expect(payrollBRes.status).toBe(201);
      payrollRunBId = Number(payrollBRes.body.data.id);

      payrollLineAId = Number((await prisma.payrollLine.findFirstOrThrow({ where: { payrollRunId: payrollRunAId } })).id);
      payrollLineBId = Number((await prisma.payrollLine.findFirstOrThrow({ where: { payrollRunId: payrollRunBId } })).id);

      const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
      expect(adminRole).toBeTruthy();

      const username = `payscope${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const createUserRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username,
          email: `${username}@erp.local`,
          fullName: 'Payroll Scoped User',
          password: 'pass1234',
          roleId: adminRole!.id,
          defaultBranchId: branchAId
        });
      expect(createUserRes.status).toBe(201);
      scopedUserId = Number(createUserRes.body.data.id);

      const scopeRes = await request(app)
        .put(`/api/v1/org/users/${scopedUserId}/scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          defaultBranchId: branchAId,
          branchAccesses: [{ branchId: branchAId, canRead: true, canWrite: true }]
        });
      expect(scopeRes.status).toBe(200);

      const loginScopedRes = await request(app).post('/api/auth/login').send({
        username,
        password: 'pass1234'
      });
      expect(loginScopedRes.status).toBe(200);
      const scopedToken = loginScopedRes.body.data.token as string;

      const payrollListRes = await request(app)
        .get('/api/v1/hr/payroll')
        .set('Authorization', `Bearer ${scopedToken}`);
      expect(payrollListRes.status).toBe(200);
      expect(payrollListRes.body.data.map((row: { id: number }) => row.id)).toContain(payrollRunAId);
      expect(payrollListRes.body.data.map((row: { id: number }) => row.id)).not.toContain(payrollRunBId);

      const allowedRunRes = await request(app)
        .get(`/api/v1/hr/payroll/${payrollRunAId}`)
        .set('Authorization', `Bearer ${scopedToken}`);
      expect(allowedRunRes.status).toBe(200);
      expect(Number(allowedRunRes.body.data.branchId)).toBe(branchAId);

      const blockedRunRes = await request(app)
        .get(`/api/v1/hr/payroll/${payrollRunBId}`)
        .set('Authorization', `Bearer ${scopedToken}`);
      expect(blockedRunRes.status).toBe(403);

      const blockedLineUpdateRes = await request(app)
        .put(`/api/v1/hr/payroll/lines/${payrollLineBId}`)
        .set('Authorization', `Bearer ${scopedToken}`)
        .send({ overtime: 50 });
      expect(blockedLineUpdateRes.status).toBe(403);

      const allowedLineUpdateRes = await request(app)
        .put(`/api/v1/hr/payroll/lines/${payrollLineAId}`)
        .set('Authorization', `Bearer ${scopedToken}`)
        .send({ overtime: 25 });
      expect(allowedLineUpdateRes.status).toBe(200);
    } finally {
      if (scopedUserId) {
        await prisma.userBranchAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.userProjectAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.userWarehouseAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.user.deleteMany({ where: { id: scopedUserId } });
      }
      if (payrollRunAId || payrollRunBId) {
        await prisma.payrollLine.deleteMany({
          where: { payrollRunId: { in: [payrollRunAId, payrollRunBId].filter(Boolean) } }
        });
        await prisma.payrollRun.deleteMany({
          where: { id: { in: [payrollRunAId, payrollRunBId].filter(Boolean) } }
        });
      }
      if (employeeAId || employeeBId) {
        await prisma.employee.deleteMany({ where: { id: { in: [employeeAId, employeeBId].filter(Boolean) } } });
      }
      if (branchAId || branchBId) {
        await prisma.branch.deleteMany({ where: { id: { in: [branchAId, branchBId].filter(Boolean) } } });
      }
    }
  });
});
