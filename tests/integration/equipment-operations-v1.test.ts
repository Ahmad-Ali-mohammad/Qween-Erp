import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Equipment operations v1', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('allocates equipment to a project and records maintenance costs', async () => {
    let categoryId = 0;
    let assetId = 0;
    let projectId = 0;
    let supplierId = 0;
    let allocationId = 0;
    let maintenanceId = 0;

    try {
      const categoryRes = await request(app)
        .post('/api/v1/equipment/assets/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('EQ-CAT'),
          nameAr: 'فئة معدات تشغيلية',
          usefulLifeMonths: 60,
          depreciationMethod: 'StraightLine'
        });

      expect(categoryRes.status).toBe(201);
      categoryId = Number(categoryRes.body.data.id);

      const assetRes = await request(app)
        .post('/api/v1/equipment/assets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('EQ-ASSET'),
          nameAr: 'حفار مشروع',
          categoryId,
          purchaseDate: '2026-02-15T00:00:00.000Z',
          purchaseCost: 15000,
          salvageValue: 0
        });

      expect(assetRes.status).toBe(201);
      assetId = Number(assetRes.body.data.id);

      const projectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('PRJ-EQ'),
          nameAr: 'مشروع تحميل معدات',
          status: 'Active',
          isActive: true,
          actualCost: 0
        });

      expect(projectRes.status).toBe(201);
      projectId = Number(projectRes.body.data.id);

      const createAllocationRes = await request(app)
        .post('/api/v1/equipment/allocations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assetId,
          projectId,
          startDate: '2026-03-01T00:00:00.000Z',
          dailyRate: 25,
          hourlyRate: 10,
          notes: 'تشغيل حفار في المشروع'
        });

      expect(createAllocationRes.status).toBe(201);
      allocationId = Number(createAllocationRes.body.data.id);

      const closeAllocationRes = await request(app)
        .post(`/api/v1/equipment/allocations/${allocationId}/close`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endDate: '2026-03-03T00:00:00.000Z',
          hoursUsed: 4,
          fuelCost: 15
        });

      expect(closeAllocationRes.status).toBe(200);
      expect(closeAllocationRes.body.data.status).toBe('CLOSED');
      expect(Number(closeAllocationRes.body.data.chargeAmount)).toBeCloseTo(130, 3);
      expect(Number(closeAllocationRes.body.data.projectExpenseId)).toBeGreaterThan(0);

      const firstSummaryRes = await request(app)
        .get(`/api/v1/projects/${projectId}/cost-summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(firstSummaryRes.status).toBe(200);
      expect(Number(firstSummaryRes.body.data.summary.actualCost)).toBeCloseTo(130, 3);

      const supplierRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('SUP-EQ'),
          nameAr: 'مورد صيانة معدات'
        });

      expect(supplierRes.status).toBe(200);
      supplierId = Number(supplierRes.body.data.id);

      const createMaintenanceRes = await request(app)
        .post('/api/v1/equipment/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assetId,
          projectId,
          supplierId,
          serviceDate: '2026-03-04T00:00:00.000Z',
          type: 'PREVENTIVE',
          cost: 55,
          description: 'صيانة دورية للمعدة'
        });

      expect(createMaintenanceRes.status).toBe(201);
      maintenanceId = Number(createMaintenanceRes.body.data.id);

      const maintenanceAssetRes = await request(app)
        .get(`/api/v1/equipment/assets/${assetId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(maintenanceAssetRes.status).toBe(200);
      expect(maintenanceAssetRes.body.data.status).toBe('MAINTENANCE');

      const completeMaintenanceRes = await request(app)
        .post(`/api/v1/equipment/maintenance/${maintenanceId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          completedAt: '2026-03-05T00:00:00.000Z',
          cost: 60
        });

      expect(completeMaintenanceRes.status).toBe(200);
      expect(completeMaintenanceRes.body.data.status).toBe('COMPLETED');
      expect(Number(completeMaintenanceRes.body.data.projectExpenseId)).toBeGreaterThan(0);
      expect(Number(completeMaintenanceRes.body.data.cost)).toBeCloseTo(60, 3);

      const finalSummaryRes = await request(app)
        .get(`/api/v1/projects/${projectId}/cost-summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(finalSummaryRes.status).toBe(200);
      expect(Number(finalSummaryRes.body.data.summary.actualCost)).toBeCloseTo(190, 3);

      const activeAssetRes = await request(app)
        .get(`/api/v1/equipment/assets/${assetId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(activeAssetRes.status).toBe(200);
      expect(activeAssetRes.body.data.status).toBe('ACTIVE');

      const eventsRes = await request(app)
        .get('/api/v1/accounting/events?limit=200')
        .set('Authorization', `Bearer ${token}`);

      expect(eventsRes.status).toBe(200);
      const eventNames = eventsRes.body.data.map((event: { name: string }) => event.name);
      expect(eventNames).toEqual(
        expect.arrayContaining(['equipment.allocation.closed', 'equipment.maintenance.completed', 'project.expense.recorded'])
      );
    } finally {
      if (maintenanceId) {
        await prisma.maintenanceLog.deleteMany({ where: { id: maintenanceId } });
      }
      if (allocationId) {
        await prisma.equipmentAllocation.deleteMany({ where: { id: allocationId } });
      }
      if (projectId) {
        await prisma.projectExpense.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (assetId) {
        await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
      }
      if (categoryId) {
        await prisma.assetCategory.deleteMany({ where: { id: categoryId } });
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { id: supplierId } });
      }
    }
  });
});
