import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Row-level access v1', () => {
  let adminToken = '';

  beforeAll(async () => {
    await ensureAdminUser();
    adminToken = await loginAdmin();
  });

  it('filters and blocks modern v1 modules by branch and project scopes', async () => {
    let branchAId = 0;
    let branchBId = 0;
    let projectAId = 0;
    let projectBId = 0;
    let employeeAId = 0;
    let employeeBId = 0;
    let supplierId = 0;
    let purchaseOrderAId = 0;
    let purchaseOrderBId = 0;
    let scopedUserId = 0;

    try {
      const suffix = uniqueCode('RLS');

      const branchARes = await request(app)
        .post('/api/v1/org/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `A-${suffix}`.slice(0, 30),
          nameAr: 'فرع ألف',
          numberingPrefix: 'A'
        });
      expect(branchARes.status).toBe(201);
      branchAId = Number(branchARes.body.data.id);

      const branchBRes = await request(app)
        .post('/api/v1/org/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `B-${suffix}`.slice(0, 30),
          nameAr: 'فرع باء',
          numberingPrefix: 'B'
        });
      expect(branchBRes.status).toBe(201);
      branchBId = Number(branchBRes.body.data.id);

      const projectA = await prisma.project.create({
        data: {
          code: uniqueCode('PRJ-A'),
          nameAr: 'مشروع ألف',
          branchId: branchAId,
          status: 'Active',
          isActive: true
        }
      });
      projectAId = projectA.id;

      const projectB = await prisma.project.create({
        data: {
          code: uniqueCode('PRJ-B'),
          nameAr: 'مشروع باء',
          branchId: branchBId,
          status: 'Active',
          isActive: true
        }
      });
      projectBId = projectB.id;

      const employeeARes = await request(app)
        .post('/api/v1/hr/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'موظف فرع ألف',
          branchId: branchAId,
          position: 'Engineer',
          baseSalary: 750
        });
      expect(employeeARes.status).toBe(201);
      employeeAId = Number(employeeARes.body.data.id);

      const employeeBRes = await request(app)
        .post('/api/v1/hr/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'موظف فرع باء',
          branchId: branchBId,
          position: 'Supervisor',
          baseSalary: 800
        });
      expect(employeeBRes.status).toBe(201);
      employeeBId = Number(employeeBRes.body.data.id);

      const supplier = await prisma.supplier.create({
        data: {
          code: uniqueCode('SUP-RLS'),
          nameAr: 'مورد الصلاحيات'
        }
      });
      supplierId = supplier.id;

      const purchaseOrderARes = await request(app)
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          branchId: branchAId,
          projectId: projectAId,
          lines: [{ description: 'بند ألف', quantity: 1, unitPrice: 10, taxRate: 0 }]
        });
      expect(purchaseOrderARes.status).toBe(201);
      purchaseOrderAId = Number(purchaseOrderARes.body.data.id);

      const purchaseOrderBRes = await request(app)
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          branchId: branchBId,
          projectId: projectBId,
          lines: [{ description: 'بند باء', quantity: 1, unitPrice: 20, taxRate: 0 }]
        });
      expect(purchaseOrderBRes.status).toBe(201);
      purchaseOrderBId = Number(purchaseOrderBRes.body.data.id);

      const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
      expect(adminRole).toBeTruthy();

      const username = `scope${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const createUserRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username,
          email: `${username}@erp.local`,
          fullName: 'Scoped ERP User',
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
          branchAccesses: [{ branchId: branchAId, canRead: true, canWrite: true }],
          projectAccesses: [{ projectId: projectAId, canRead: true, canWrite: true }]
        });
      expect(scopeRes.status).toBe(200);

      const loginScopedRes = await request(app).post('/api/auth/login').send({
        username,
        password: 'pass1234'
      });
      expect(loginScopedRes.status).toBe(200);
      const scopedToken = loginScopedRes.body.data.token as string;

      const bootstrapRes = await request(app)
        .get('/api/v1/org/bootstrap')
        .set('Authorization', `Bearer ${scopedToken}`);

      expect(bootstrapRes.status).toBe(200);
      expect(bootstrapRes.body.data.branches.map((row: { id: number }) => row.id)).toEqual([branchAId]);

      const employeesRes = await request(app)
        .get('/api/v1/hr/employees')
        .set('Authorization', `Bearer ${scopedToken}`);

      expect(employeesRes.status).toBe(200);
      expect(employeesRes.body.data.map((row: { id: number }) => row.id)).toContain(employeeAId);
      expect(employeesRes.body.data.map((row: { id: number }) => row.id)).not.toContain(employeeBId);

      const accessibleProjectRes = await request(app)
        .get(`/api/v1/projects/${projectAId}/cost-summary`)
        .set('Authorization', `Bearer ${scopedToken}`);
      expect(accessibleProjectRes.status).toBe(200);

      const blockedProjectRes = await request(app)
        .get(`/api/v1/projects/${projectBId}/cost-summary`)
        .set('Authorization', `Bearer ${scopedToken}`);
      expect(blockedProjectRes.status).toBe(403);

      const purchaseOrdersRes = await request(app)
        .get('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${scopedToken}`);

      expect(purchaseOrdersRes.status).toBe(200);
      expect(purchaseOrdersRes.body.data.rows.map((row: { id: number }) => row.id)).toContain(purchaseOrderAId);
      expect(purchaseOrdersRes.body.data.rows.map((row: { id: number }) => row.id)).not.toContain(purchaseOrderBId);

      const blockedPurchaseOrderCreate = await request(app)
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${scopedToken}`)
        .send({
          supplierId,
          branchId: branchBId,
          projectId: projectBId,
          lines: [{ description: 'محاولة ممنوعة', quantity: 1, unitPrice: 15, taxRate: 0 }]
        });

      expect(blockedPurchaseOrderCreate.status).toBe(403);
    } finally {
      if (scopedUserId) {
        await prisma.userBranchAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.userProjectAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.userWarehouseAccess.deleteMany({ where: { userId: scopedUserId } });
        await prisma.user.deleteMany({ where: { id: scopedUserId } });
      }
      if (purchaseOrderAId || purchaseOrderBId) {
        await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: [purchaseOrderAId, purchaseOrderBId].filter(Boolean) } } });
        await prisma.purchaseOrder.deleteMany({ where: { id: { in: [purchaseOrderAId, purchaseOrderBId].filter(Boolean) } } });
      }
      if (employeeAId || employeeBId) {
        await prisma.employee.deleteMany({ where: { id: { in: [employeeAId, employeeBId].filter(Boolean) } } });
      }
      if (projectAId || projectBId) {
        await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId].filter(Boolean) } } });
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { id: supplierId } });
      }
      if (branchAId || branchBId) {
        await prisma.branch.deleteMany({ where: { id: { in: [branchAId, branchBId].filter(Boolean) } } });
      }
    }
  });
});
