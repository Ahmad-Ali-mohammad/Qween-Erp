import request from 'supertest';
import { listAccountingEvents } from '../../src/modules/accounting/events';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Site operations v1 flow', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('handles daily logs, material requests, progress updates, and equipment issues', async () => {
    let branchId = 0;
    let siteId = 0;
    let projectId = 0;
    let warehouseId = 0;
    let itemId = 0;
    let taskId = 0;
    let assetCategoryId = 0;
    let assetId = 0;
    let dailyLogId = 0;
    let materialRequestId = 0;
    let progressEntryId = 0;
    let equipmentIssueId = 0;
    let maintenanceLogId = 0;

    try {
      const branch = await prisma.branch.create({
        data: {
          code: uniqueCode('BR-SITE'),
          nameAr: 'فرع المواقع'
        }
      });
      branchId = branch.id;

      const site = await prisma.site.create({
        data: {
          branchId,
          code: uniqueCode('SITE'),
          nameAr: 'موقع الأبراج'
        }
      });
      siteId = site.id;

      const project = await prisma.project.create({
        data: {
          code: uniqueCode('PRJ-SITE'),
          nameAr: 'مشروع تشغيل ميداني',
          branchId,
          siteId,
          status: 'ACTIVE',
          budget: 25000,
          actualCost: 0
        }
      });
      projectId = project.id;

      const task = await prisma.projectTask.create({
        data: {
          projectId,
          title: 'صب القواعد',
          status: 'TODO',
          progress: 0
        }
      });
      taskId = task.id;

      const warehouse = await prisma.warehouse.create({
        data: {
          code: uniqueCode('WH-SITE'),
          branchId,
          siteId,
          nameAr: 'مستودع الموقع'
        }
      });
      warehouseId = warehouse.id;

      const item = await prisma.item.create({
        data: {
          code: uniqueCode('ITEM'),
          nameAr: 'حديد تسليح',
          purchasePrice: 15,
          onHandQty: 10,
          inventoryValue: 150
        }
      });
      itemId = item.id;

      await prisma.stockBalance.create({
        data: {
          itemId,
          warehouseId,
          locationId: null,
          quantity: 10,
          value: 150,
          avgCost: 15
        }
      });

      const assetCategory = await prisma.assetCategory.create({
        data: {
          code: uniqueCode('ACAT'),
          nameAr: 'معدات الموقع',
          usefulLifeMonths: 60
        }
      });
      assetCategoryId = assetCategory.id;

      const asset = await prisma.fixedAsset.create({
        data: {
          code: uniqueCode('EQ'),
          nameAr: 'هزاز خرسانة',
          categoryId: assetCategoryId,
          purchaseCost: 3000,
          netBookValue: 3000,
          status: 'ACTIVE'
        }
      });
      assetId = asset.id;

      const dailyLogRes = await request(app)
        .post('/api/v1/site/daily-log')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          siteId,
          projectId,
          logDate: '2026-03-08',
          weather: 'Sunny',
          manpowerCount: 18,
          equipmentCount: 4,
          progressSummary: 'إنجاز صب القواعد',
          issues: 'لا توجد معوقات'
        });

      expect(dailyLogRes.status).toBe(201);
      dailyLogId = Number(dailyLogRes.body.data.id);

      const materialRequestRes = await request(app)
        .post('/api/v1/site/material-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          siteId,
          projectId,
          warehouseId,
          requestDate: '2026-03-08',
          neededBy: '2026-03-09',
          notes: 'صرف عاجل',
          lines: [
            {
              itemId,
              quantity: 4,
              estimatedUnitCost: 15
            }
          ]
        });

      expect(materialRequestRes.status).toBe(201);
      materialRequestId = Number(materialRequestRes.body.data.id);
      expect(materialRequestRes.body.data.status).toBe('DRAFT');

      const submitRes = await request(app)
        .post(`/api/v1/site/material-requests/${materialRequestId}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.status).toBe('SUBMITTED');

      const approveRequestRes = await request(app)
        .post(`/api/v1/site/material-requests/${materialRequestId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(approveRequestRes.status).toBe(200);
      expect(approveRequestRes.body.data.status).toBe('APPROVED');

      const fulfillRequestRes = await request(app)
        .post(`/api/v1/site/material-requests/${materialRequestId}/fulfill`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          warehouseId,
          fulfilledAt: '2026-03-08'
        });

      expect(fulfillRequestRes.status).toBe(200);
      expect(fulfillRequestRes.body.data.status).toBe('FULFILLED');
      expect(Number(fulfillRequestRes.body.data.lines[0].issuedQuantity)).toBeCloseTo(4, 3);

      const stockBalance = await prisma.stockBalance.findFirst({
        where: { itemId, warehouseId, locationId: null }
      });
      expect(stockBalance).toBeTruthy();
      expect(Number(stockBalance!.quantity)).toBeCloseTo(6, 3);

      const progressRes = await request(app)
        .post('/api/v1/site/progress')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          siteId,
          projectId,
          taskId,
          progressPercent: 60,
          quantityCompleted: 1,
          description: 'تم تنفيذ 60% من المهمة'
        });

      expect(progressRes.status).toBe(201);
      progressEntryId = Number(progressRes.body.data.id);

      const updatedTask = await prisma.projectTask.findUnique({ where: { id: taskId } });
      expect(updatedTask).toBeTruthy();
      expect(updatedTask!.status).toBe('IN_PROGRESS');
      expect(updatedTask!.progress).toBe(60);

      const equipmentIssueRes = await request(app)
        .post('/api/v1/site/equipment-issues')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          siteId,
          projectId,
          assetId,
          title: 'عطل في المحرك',
          description: 'المعدة لا تعمل عند التشغيل',
          severity: 'HIGH',
          createMaintenance: true
        });

      expect(equipmentIssueRes.status).toBe(201);
      equipmentIssueId = Number(equipmentIssueRes.body.data.id);
      maintenanceLogId = Number(equipmentIssueRes.body.data.maintenanceLog?.id ?? 0);
      expect(maintenanceLogId).toBeGreaterThan(0);
      expect(equipmentIssueRes.body.data.status).toBe('ESCALATED');

      const refreshedAsset = await prisma.fixedAsset.findUnique({ where: { id: assetId } });
      expect(refreshedAsset?.status).toBe('MAINTENANCE');

      const events = listAccountingEvents(30).map((row) => row.name);
      expect(events).toEqual(
        expect.arrayContaining([
          'site.daily_log.recorded',
          'site.material_request.fulfilled',
          'site.progress.recorded',
          'site.equipment_issue.reported',
          'inventory.movement.recorded'
        ])
      );
    } finally {
      if (equipmentIssueId) {
        await prisma.siteEquipmentIssue.deleteMany({ where: { id: equipmentIssueId } });
      }
      if (maintenanceLogId) {
        await prisma.maintenanceLog.deleteMany({ where: { id: maintenanceLogId } });
      }
      if (progressEntryId) {
        await prisma.siteProgressEntry.deleteMany({ where: { id: progressEntryId } });
      }
      if (materialRequestId) {
        await prisma.siteMaterialRequest.deleteMany({ where: { id: materialRequestId } });
      }
      if (dailyLogId) {
        await prisma.siteDailyLog.deleteMany({ where: { id: dailyLogId } });
      }
      if (taskId) {
        await prisma.projectTask.deleteMany({ where: { id: taskId } });
      }
      if (assetId) {
        await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
      }
      if (assetCategoryId) {
        await prisma.assetCategory.deleteMany({ where: { id: assetCategoryId } });
      }
      if (itemId) {
        await prisma.stockBalance.deleteMany({ where: { itemId } });
        await prisma.item.deleteMany({ where: { id: itemId } });
      }
      if (warehouseId) {
        await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (siteId) {
        await prisma.site.deleteMany({ where: { id: siteId } });
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } });
      }
    }
  });
});
