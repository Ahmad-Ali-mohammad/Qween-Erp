import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Quality, tenders, risks and scheduling v1 routes', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('supports tenders, scheduling, quality/safety, and risks end-to-end flow', async () => {
    let customerId = 0;
    let tenderId = 0;
    let projectId = 0;
    let taskId = 0;
    let progressId = 0;
    let categoryId = 0;
    let assetId = 0;
    let inspectionId = 0;
    let incidentId = 0;
    let riskId = 0;

    try {
      const customerRes = await request(app)
        .post('/api/v1/crm/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('CUST-TNDR'),
          nameAr: 'عميل اختبار العطاءات'
        });

      expect([200, 201]).toContain(customerRes.status);
      customerId = Number(customerRes.body.data.id);

      const tenderRes = await request(app)
        .post('/api/v1/tenders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: uniqueCode('TENDER'),
          customerId,
          value: 12500,
          probability: 60
        });

      expect(tenderRes.status).toBe(201);
      tenderId = Number(tenderRes.body.data.id);

      const submitTenderRes = await request(app)
        .post(`/api/v1/tenders/${tenderId}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(submitTenderRes.status).toBe(200);
      expect(submitTenderRes.body.data.stage).toBe('BID_SUBMITTED');

      const tenderResultRes = await request(app)
        .post(`/api/v1/tenders/${tenderId}/result`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          result: 'LOST',
          reason: 'pricing'
        });

      expect(tenderResultRes.status).toBe(200);
      expect(tenderResultRes.body.data.result).toBe('LOST');

      const tenderReportRes = await request(app)
        .get('/api/v1/tenders/reports/win-rate')
        .set('Authorization', `Bearer ${token}`);

      expect(tenderReportRes.status).toBe(200);
      expect(Number(tenderReportRes.body.data.total)).toBeGreaterThanOrEqual(1);

      const projectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('PRJ-SCH'),
          nameAr: 'مشروع اختبار الجدولة',
          status: 'Active',
          isActive: true,
          actualCost: 0
        });

      expect(projectRes.status).toBe(201);
      projectId = Number(projectRes.body.data.id);

      const taskRes = await request(app)
        .post('/api/v1/scheduling/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          title: 'Task for scheduling flow',
          priority: 'HIGH',
          status: 'TODO',
          estimatedHours: 8
        });

      expect(taskRes.status).toBe(201);
      taskId = Number(taskRes.body.data.id);

      const progressRes = await request(app)
        .post(`/api/v1/scheduling/tasks/${taskId}/progress`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          taskId,
          progressPercent: 35,
          notes: 'Initial progress update'
        });

      expect(progressRes.status).toBe(201);
      progressId = Number(progressRes.body.data.id);

      const criticalRes = await request(app)
        .get(`/api/v1/scheduling/projects/${projectId}/critical-path`)
        .set('Authorization', `Bearer ${token}`);

      expect(criticalRes.status).toBe(200);
      expect(Number(criticalRes.body.data.totalTasks)).toBeGreaterThanOrEqual(1);

      const categoryRes = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('AST-CAT-QS'),
          nameAr: 'فئة معدات السلامة',
          usefulLifeMonths: 36
        });

      expect(categoryRes.status).toBe(201);
      categoryId = Number(categoryRes.body.data.id);

      const assetRes = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('AST-QS'),
          nameAr: 'معدات سلامة موقع',
          categoryId,
          purchaseDate: '2026-01-01',
          purchaseCost: 2500
        });

      expect(assetRes.status).toBe(201);
      assetId = Number(assetRes.body.data.id);

      const inspectionRes = await request(app)
        .post('/api/v1/quality/inspections')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          progressSummary: 'Inspection summary',
          issues: 'No blocking issues'
        });

      expect(inspectionRes.status).toBe(201);
      inspectionId = Number(inspectionRes.body.data.id);

      const incidentRes = await request(app)
        .post('/api/v1/safety/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          assetId,
          title: 'Safety incident test',
          severity: 'HIGH',
          description: 'Minor issue'
        });

      expect(incidentRes.status).toBe(201);
      incidentId = Number(incidentRes.body.data.id);

      const resolveRes = await request(app)
        .post(`/api/v1/safety/incidents/${incidentId}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          resolutionNotes: 'Issue resolved by team lead'
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe('RESOLVED');

      const safetyReportRes = await request(app)
        .get('/api/v1/safety/reports')
        .set('Authorization', `Bearer ${token}`);

      expect(safetyReportRes.status).toBe(200);
      expect(Number(safetyReportRes.body.data.total)).toBeGreaterThanOrEqual(1);

      const riskRes = await request(app)
        .post('/api/v1/risks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: uniqueCode('Risk integration'),
          priority: 'HIGH',
          status: 'OPEN',
          description: 'Risk record for integration test'
        });

      expect(riskRes.status).toBe(201);
      riskId = Number(riskRes.body.data.id);

      const mitigationRes = await request(app)
        .post(`/api/v1/risks/${riskId}/mitigation`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          notes: 'Mitigation step captured',
          status: 'IN_PROGRESS'
        });

      expect(mitigationRes.status).toBe(200);
      expect(mitigationRes.body.data.status).toBe('IN_PROGRESS');

      const highRiskRes = await request(app)
        .get('/api/v1/risks/reports/high')
        .set('Authorization', `Bearer ${token}`);

      expect(highRiskRes.status).toBe(200);
      expect(Array.isArray(highRiskRes.body.data)).toBe(true);
      expect(highRiskRes.body.data.some((row: { id: number }) => Number(row.id) === riskId)).toBe(true);
    } finally {
      if (progressId) {
        await prisma.siteProgressEntry.deleteMany({ where: { id: progressId } });
      }
      if (taskId) {
        await prisma.projectTask.deleteMany({ where: { id: taskId } });
      }
      if (inspectionId) {
        await prisma.siteDailyLog.deleteMany({ where: { id: inspectionId } });
      }
      if (incidentId) {
        await prisma.siteEquipmentIssue.deleteMany({ where: { id: incidentId } });
      }
      if (riskId) {
        await prisma.userTask.deleteMany({ where: { id: riskId } });
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (assetId) {
        await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
      }
      if (categoryId) {
        await prisma.assetCategory.deleteMany({ where: { id: categoryId } });
      }
      if (tenderId) {
        await prisma.opportunity.deleteMany({ where: { id: tenderId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
    }
  });
});
