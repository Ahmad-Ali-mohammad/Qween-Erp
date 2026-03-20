import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Budgeting system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let accountId = 0;
  let scenarioId = 0;
  let versionId = 0;
  let legacyBudgetId = 0;
  let legacyBudgetLineId = 0;
  let forecastId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (!legacyBudgetId && versionId) {
      const mappedVersion = await prisma.budgetVersion.findUnique({
        where: { id: versionId },
        select: { legacyBudgetId: true }
      });
      legacyBudgetId = Number(mappedVersion?.legacyBudgetId ?? 0);
    }

    if (forecastId) {
      await prisma.forecastSnapshot.deleteMany({ where: { id: forecastId } });
    }
    if (versionId) {
      await prisma.varianceEntry.deleteMany({ where: { versionId } });
      await prisma.budgetAllocation.deleteMany({ where: { versionId } });
      await prisma.forecastSnapshot.deleteMany({ where: { versionId } });
      await prisma.budgetVersion.deleteMany({ where: { id: versionId } });
    }
    if (scenarioId) {
      await prisma.budgetScenario.deleteMany({ where: { id: scenarioId } });
    }
    if (legacyBudgetId) {
      await prisma.budgetLine.deleteMany({ where: { budgetId: legacyBudgetId } });
      await prisma.budget.deleteMany({ where: { id: legacyBudgetId } });
    }
    if (accountId) {
      await prisma.budgetLine.deleteMany({ where: { accountId } });
      await prisma.account.deleteMany({ where: { id: accountId } });
    }
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it('runs budgeting bridge workflow end-to-end with control-center and legacy compatibility', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع الموازنات'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع الموازنات',
          branchId,
          budget: 250000
        }
      })
    ).id;

    const accountCreate = await request(app).post('/api/accounts').set(auth()).send({
      code: uniqueCode('ACC'),
      nameAr: 'مصروف تخطيط',
      type: 'EXPENSE',
      allowPosting: true,
      normalBalance: 'Debit'
    });
    expect(accountCreate.status).toBe(201);
    accountId = Number(accountCreate.body.data.id);

    const scenarioCreate = await request(app).post('/api/budgeting/scenarios').set(auth()).send({
      code: uniqueCode('BSC'),
      nameAr: 'سيناريو التخطيط 2026',
      fiscalYear: 2026,
      branchId,
      controlLevel: 'WARNING',
      notes: 'سيناريو اختبار bridge-first'
    });
    expect(scenarioCreate.status).toBe(201);
    scenarioId = Number(scenarioCreate.body.data.id);

    const scenarioSubmit = await request(app).post(`/api/budgeting/scenarios/${scenarioId}/submit`).set(auth()).send({});
    expect(scenarioSubmit.status).toBe(200);
    expect(scenarioSubmit.body.data.approvalStatus).toBe('PENDING');

    const controlQueuesBeforeApprove = await request(app).get('/api/control-center/dashboard/queues').set(auth());
    expect(controlQueuesBeforeApprove.status).toBe(200);
    expect(controlQueuesBeforeApprove.body.data.some((row: any) => row.key === 'budgeting-queue' && Number(row.count) >= 1)).toBe(true);

    const scenarioApprove = await request(app).post(`/api/budgeting/scenarios/${scenarioId}/approve`).set(auth()).send({});
    expect(scenarioApprove.status).toBe(200);
    expect(scenarioApprove.body.data.approvalStatus).toBe('APPROVED');

    const versionCreate = await request(app).post('/api/budgeting/versions').set(auth()).send({
      scenarioId,
      label: 'Baseline 2026',
      effectiveDate: '2026-01-01'
    });
    expect(versionCreate.status).toBe(201);
    versionId = Number(versionCreate.body.data.id);

    const upsertAllocations = await request(app).post('/api/budgeting/allocations/upsert-bulk').set(auth()).send({
      versionId,
      allocations: [
        {
          accountId,
          period: 1,
          plannedAmount: 100,
          actualAmount: 60,
          committedAmount: 10,
          branchId,
          projectId
        },
        {
          accountId,
          period: 1,
          plannedAmount: 50,
          actualAmount: 0,
          committedAmount: 0,
          branchId
        }
      ]
    });
    expect(upsertAllocations.status).toBe(200);
    expect(Array.isArray(upsertAllocations.body.data)).toBe(true);
    expect(upsertAllocations.body.data.length).toBeGreaterThanOrEqual(2);

    const versionAfterAllocations = await request(app).get(`/api/budgeting/versions/${versionId}`).set(auth());
    expect(versionAfterAllocations.status).toBe(200);
    legacyBudgetId = Number(versionAfterAllocations.body.data.legacyBudgetId);
    expect(legacyBudgetId).toBeGreaterThan(0);

    const legacyBudgetLines = await request(app).get(`/api/budget-lines?budgetId=${legacyBudgetId}`).set(auth());
    expect(legacyBudgetLines.status).toBe(200);
    expect(Array.isArray(legacyBudgetLines.body.data)).toBe(true);
    expect(legacyBudgetLines.body.data).toHaveLength(1);
    expect(Number(legacyBudgetLines.body.data[0].amount)).toBe(150);
    expect(Number(legacyBudgetLines.body.data[0].actual)).toBe(60);
    expect(Number(legacyBudgetLines.body.data[0].committed)).toBe(10);

    const legacyBudgetLineCreate = await request(app).post('/api/budget-lines').set(auth()).send({
      budgetId: legacyBudgetId,
      accountId,
      period: 2,
      amount: 80,
      actual: 10,
      committed: 5
    });
    expect(legacyBudgetLineCreate.status).toBe(201);
    legacyBudgetLineId = Number(legacyBudgetLineCreate.body.data.id);

    const allocationsAfterLegacyWrite = await request(app).get(`/api/budgeting/allocations?versionId=${versionId}&period=2`).set(auth());
    expect(allocationsAfterLegacyWrite.status).toBe(200);
    expect(allocationsAfterLegacyWrite.body.data.some((row: any) => Number(row.plannedAmount) === 80)).toBe(true);

    const publishVersion = await request(app).post(`/api/budgeting/versions/${versionId}/publish`).set(auth()).send({});
    expect(publishVersion.status).toBe(200);
    expect(publishVersion.body.data.status).toBe('PUBLISHED');

    const legacyBudget = await request(app).get(`/api/budgets/${legacyBudgetId}`).set(auth());
    expect(legacyBudget.status).toBe(200);
    expect(legacyBudget.body.data.status).toBe('ACTIVE');

    const varianceResponse = await request(app).get(`/api/budgeting/variance?versionId=${versionId}`).set(auth());
    expect(varianceResponse.status).toBe(200);
    expect(Array.isArray(varianceResponse.body.data)).toBe(true);
    expect(varianceResponse.body.data.some((row: any) => row.severity === 'CRITICAL')).toBe(true);
    expect(Number(varianceResponse.body.meta.summary.varianceAmount)).toBeGreaterThan(0);

    const forecastCreate = await request(app).post('/api/budgeting/forecast/snapshot').set(auth()).send({
      versionId,
      branchId,
      snapshotDate: '2026-03-20',
      label: 'Forecast Mar 2026'
    });
    expect(forecastCreate.status).toBe(201);
    forecastId = Number(forecastCreate.body.data.id);
    expect(Number(forecastCreate.body.data.forecastTotal)).toBeGreaterThan(0);

    const budgetingDashboardPaths = ['summary', 'queues', 'activity', 'alerts', 'charts'];
    for (const path of budgetingDashboardPaths) {
      const response = await request(app).get(`/api/budgeting/dashboard/${path}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const controlAlerts = await request(app).get('/api/control-center/dashboard/alerts').set(auth());
    expect(controlAlerts.status).toBe(200);
    expect(controlAlerts.body.data.some((row: any) => row.key === 'budgeting-variance')).toBe(true);

    const controlActivity = await request(app).get('/api/control-center/dashboard/activity').set(auth());
    expect(controlActivity.status).toBe(200);
    expect(controlActivity.body.data.some((row: any) => String(row.title).startsWith('budgeting.'))).toBe(true);

    const legacyVarianceReport = await request(app).get(`/api/reports/budget-variance/${legacyBudgetId}`).set(auth());
    expect(legacyVarianceReport.status).toBe(200);
    expect(Array.isArray(legacyVarianceReport.body.data.lines)).toBe(true);
    expect(Number(legacyVarianceReport.body.data.summary.budget)).toBeGreaterThan(0);

    const legacySummaryReport = await request(app).get('/api/reports/budget-summary').set(auth());
    expect(legacySummaryReport.status).toBe(200);
    expect(Array.isArray(legacySummaryReport.body.data)).toBe(true);
    expect(legacySummaryReport.body.data.some((row: any) => Number(row.id) === legacyBudgetId)).toBe(true);

    const [outboxEvents, scenarioRow, versionRow, forecastRow] = await Promise.all([
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'budgeting.scenario.created',
              'budgeting.scenario.submitted',
              'budgeting.scenario.approved',
              'budgeting.version.published',
              'budgeting.forecast.snapshot.created',
              'budgeting.variance.detected'
            ]
          }
        }
      }),
      prisma.budgetScenario.findUnique({ where: { id: scenarioId } }),
      prisma.budgetVersion.findUnique({ where: { id: versionId } }),
      prisma.forecastSnapshot.findUnique({ where: { id: forecastId } })
    ]);

    expect(scenarioRow?.approvalStatus).toBe('APPROVED');
    expect(versionRow?.status).toBe('PUBLISHED');
    expect(Number(versionRow?.plannedTotal)).toBeGreaterThan(0);
    expect(Number(versionRow?.varianceTotal)).toBeGreaterThan(0);
    expect(forecastRow?.label).toBe('Forecast Mar 2026');

    const eventTypes = new Set(outboxEvents.map((event) => event.eventType));
    expect(eventTypes.has('budgeting.scenario.created')).toBe(true);
    expect(eventTypes.has('budgeting.scenario.submitted')).toBe(true);
    expect(eventTypes.has('budgeting.scenario.approved')).toBe(true);
    expect(eventTypes.has('budgeting.version.published')).toBe(true);
    expect(eventTypes.has('budgeting.forecast.snapshot.created')).toBe(true);
    expect(eventTypes.has('budgeting.variance.detected')).toBe(true);
  });
});
