import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Scheduling system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let employeeId = 0;
  let assetCategoryId = 0;
  let assetId = 0;
  let planId = 0;
  let taskOneId = 0;
  let taskTwoId = 0;
  let dependencyId = 0;
  let snapshotId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (planId) await prisma.schedulePlan.deleteMany({ where: { id: planId } });
    if (assetId) await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
    if (assetCategoryId) await prisma.assetCategory.deleteMany({ where: { id: assetCategoryId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs plan, tasks, dependency, and critical-path flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع الجدولة'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع الجدولة',
          branchId,
          budget: 180000
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'مهندس تخطيط',
          branchId,
          status: 'ACTIVE',
          baseSalary: 2800
        }
      })
    ).id;

    assetCategoryId = (
      await prisma.assetCategory.create({
        data: {
          code: uniqueCode('CAT'),
          nameAr: 'معدات جدولة',
          usefulLifeMonths: 48
        }
      })
    ).id;

    assetId = (
      await prisma.fixedAsset.create({
        data: {
          code: uniqueCode('AST'),
          nameAr: 'رافعة مساندة',
          branchId,
          categoryId: assetCategoryId,
          purchaseCost: 250000,
          netBookValue: 250000
        }
      })
    ).id;

    const planCreate = await request(app).post('/api/scheduling/plans').set(auth()).send({
      branchId,
      projectId,
      title: 'خطة تنفيذ المشروع',
      baselineStart: '2025-01-01',
      baselineEnd: '2030-01-30'
    });
    expect(planCreate.status).toBe(201);
    planId = Number(planCreate.body.data.id);

    const taskOneCreate = await request(app).post('/api/scheduling/tasks').set(auth()).send({
      branchId,
      projectId,
      planId,
      title: 'أعمال الأساسات',
      wbsCode: '1.1',
      startDate: '2025-01-01',
      endDate: '2025-01-10',
      progressPercent: 40,
      isCritical: true,
      assignments: [
        { resourceType: 'EMPLOYEE', resourceRefId: employeeId, quantity: 1, allocationPercent: 60 },
        { resourceType: 'ASSET', resourceRefId: assetId, quantity: 1, allocationPercent: 80 }
      ]
    });
    expect(taskOneCreate.status).toBe(201);
    taskOneId = Number(taskOneCreate.body.data.id);
    expect(Array.isArray(taskOneCreate.body.data.assignments)).toBe(true);
    expect(taskOneCreate.body.data.assignments).toHaveLength(2);

    const taskTwoCreate = await request(app).post('/api/scheduling/tasks').set(auth()).send({
      branchId,
      projectId,
      planId,
      title: 'أعمال الهيكل',
      wbsCode: '1.2',
      startDate: '2030-01-11',
      endDate: '2030-01-20',
      progressPercent: 0,
      isCritical: false,
      assignments: [{ resourceType: 'EMPLOYEE', resourceRefId: employeeId, quantity: 1, allocationPercent: 50 }]
    });
    expect(taskTwoCreate.status).toBe(201);
    taskTwoId = Number(taskTwoCreate.body.data.id);

    const dependencyCreate = await request(app).post('/api/scheduling/dependencies').set(auth()).send({
      planId,
      predecessorTaskId: taskOneId,
      successorTaskId: taskTwoId,
      dependencyType: 'FS',
      lagDays: 2
    });
    expect(dependencyCreate.status).toBe(201);
    dependencyId = Number(dependencyCreate.body.data.id);

    const snapshotCreate = await request(app).post('/api/scheduling/critical-path').set(auth()).send({
      planId,
      title: 'لقطة المسار الحرج'
    });
    expect(snapshotCreate.status).toBe(201);
    snapshotId = Number(snapshotCreate.body.data.id);
    expect(snapshotCreate.body.data.delayedTasksCount).toBeGreaterThan(0);

    const tasksList = await request(app).get(`/api/scheduling/tasks?planId=${planId}`).set(auth());
    expect(tasksList.status).toBe(200);
    expect(tasksList.body.data.some((row: any) => row.id === taskOneId && row.assignments.length === 2)).toBe(true);

    const dependenciesList = await request(app).get(`/api/scheduling/dependencies?planId=${planId}`).set(auth());
    expect(dependenciesList.status).toBe(200);
    expect(
      dependenciesList.body.data.some(
        (row: any) => row.id === dependencyId && row.predecessorTask?.id === taskOneId && row.successorTask?.id === taskTwoId
      )
    ).toBe(true);

    const snapshotsList = await request(app).get(`/api/scheduling/critical-path?planId=${planId}`).set(auth());
    expect(snapshotsList.status).toBe(200);
    expect(snapshotsList.body.data.some((row: any) => row.id === snapshotId)).toBe(true);

    const controlAlerts = await request(app).get('/api/control-center/dashboard/alerts').set(auth());
    expect(controlAlerts.status).toBe(200);
    expect(controlAlerts.body.data.some((row: any) => row.key === 'scheduling-critical-delay')).toBe(true);

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const response = await request(app).get(`/api/scheduling/dashboard/${section}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const [snapshot, assignmentsCount, activity, events] = await Promise.all([
      prisma.criticalPathSnapshot.findUnique({ where: { id: snapshotId } }),
      prisma.resourceAssignment.count({ where: { taskId: taskOneId } }),
      request(app).get('/api/control-center/dashboard/activity').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'scheduling.plan.created',
              'scheduling.task.created',
              'scheduling.critical-path.snapshot.created',
              'scheduling.delay.detected'
            ]
          }
        }
      })
    ]);

    expect(snapshot?.criticalTasksCount).toBeGreaterThan(0);
    expect(snapshot?.delayedTasksCount).toBeGreaterThan(0);
    expect(assignmentsCount).toBe(2);
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: any) => String(row.title).startsWith('scheduling.'))).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('scheduling.plan.created')).toBe(true);
    expect(eventTypes.has('scheduling.task.created')).toBe(true);
    expect(eventTypes.has('scheduling.critical-path.snapshot.created')).toBe(true);
    expect(eventTypes.has('scheduling.delay.detected')).toBe(true);
  });
});
