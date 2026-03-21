import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Control center system', () => {
  let token = '';
  let adminUserId = 0;
  let branchId = 0;
  let workflowId = 0;
  let notificationId = 0;
  let taskId = 0;
  let projectId = 0;
  let employeeId = 0;
  let inspectionId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    adminUserId = Number(admin?.id || 0);
  });

  afterAll(async () => {
    if (inspectionId) await prisma.inspection.deleteMany({ where: { id: inspectionId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (taskId) await prisma.userTask.deleteMany({ where: { id: taskId } });
    if (notificationId) await prisma.notification.deleteMany({ where: { id: notificationId } });
    if (workflowId) await prisma.approvalWorkflow.deleteMany({ where: { id: workflowId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it(
    'serves approvals, notifications, tasks, and governance from one namespace',
    async () => {
    const branchCreate = await request(app).post('/api/control-center/branches').set(auth()).send({
      code: uniqueCode('CCB'),
      nameAr: 'فرع مركز الرقابة'
    });
    expect(branchCreate.status).toBe(201);
    branchId = Number(branchCreate.body.data.id);

    const workflowCreate = await request(app).post('/api/control-center/approval-workflows').set(auth()).send({
      code: uniqueCode('CCW'),
      nameAr: 'اعتماد فحص الجودة',
      entityType: 'quality-inspection',
      branchId,
      steps: { levels: [{ order: 1, role: 'admin' }] }
    });
    expect(workflowCreate.status).toBe(201);
    workflowId = Number(workflowCreate.body.data.id);

    notificationId = (
      await prisma.notification.create({
        data: {
          userId: adminUserId,
          title: 'تنبيه جودة جديد',
          message: 'يوجد فحص بانتظار الاعتماد',
          type: 'ALERT'
        }
      })
    ).id;

    taskId = (
      await prisma.userTask.create({
        data: {
          title: 'مراجعة فحص الجودة',
          description: 'اعتمد الفحص المعلق في لوحة المركز',
          priority: 'HIGH',
          status: 'OPEN'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('CCP'),
          nameAr: 'مشروع مركز الرقابة',
          branchId,
          budget: 250000
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('CCE'),
          fullName: 'مفتش مركز الرقابة',
          branchId,
          status: 'ACTIVE',
          baseSalary: 2500
        }
      })
    ).id;

    const inspectionCreate = await request(app).post('/api/quality/inspections').set(auth()).send({
      branchId,
      projectId,
      inspectorEmployeeId: employeeId,
      inspectionDate: '2026-03-21',
      result: 'FAIL',
      severity: 'HIGH',
      title: 'فحص قيد الاعتماد'
    });
    expect(inspectionCreate.status).toBe(201);
    inspectionId = Number(inspectionCreate.body.data.id);

    const inspectionSubmit = await request(app).post(`/api/quality/inspections/${inspectionId}/submit`).set(auth()).send({});
    expect(inspectionSubmit.status).toBe(200);
    expect(inspectionSubmit.body.data.approvalStatus).toBe('PENDING');

    const approvals = await request(app).get('/api/control-center/approval-requests').set(auth());
    expect(approvals.status).toBe(200);
    expect(approvals.body.data.some((row: any) => row.type === 'quality-inspection' && row.id === `inspection-${inspectionId}`)).toBe(true);

    const notifications = await request(app).get('/api/control-center/notifications').set(auth());
    expect(notifications.status).toBe(200);
    expect(notifications.body.data.some((row: any) => row.id === notificationId && row.isRead === false)).toBe(true);

    const readNotification = await request(app).post(`/api/control-center/notifications/${notificationId}/read`).set(auth()).send({});
    expect(readNotification.status).toBe(200);
    expect(readNotification.body.data.isRead).toBe(true);

    const readAllNotifications = await request(app).post('/api/control-center/notifications/read-all').set(auth()).send({});
    expect(readAllNotifications.status).toBe(200);

    const tasks = await request(app).get('/api/control-center/tasks').set(auth());
    expect(tasks.status).toBe(200);
    expect(tasks.body.data.some((row: any) => row.id === taskId)).toBe(true);

    const assignTask = await request(app).post(`/api/control-center/tasks/${taskId}/assign`).set(auth()).send({ userId: adminUserId });
    expect(assignTask.status).toBe(200);
    expect(assignTask.body.data.userId).toBe(adminUserId);

    const completeTask = await request(app).patch(`/api/control-center/tasks/${taskId}/status`).set(auth()).send({ status: 'DONE' });
    expect(completeTask.status).toBe(200);
    expect(completeTask.body.data.status).toBe('DONE');

    const branches = await request(app).get('/api/control-center/branches').set(auth());
    expect(branches.status).toBe(200);
    expect(branches.body.data.some((row: any) => row.id === branchId)).toBe(true);

    const workflows = await request(app).get('/api/control-center/approval-workflows').set(auth());
    expect(workflows.status).toBe(200);
    expect(workflows.body.data.some((row: any) => row.id === workflowId)).toBe(true);

    const liveEvents = await request(app).get('/api/control-center/events/live?page=1&limit=50').set(auth());
    expect(liveEvents.status).toBe(200);
    expect(liveEvents.body.data.some((row: any) => String(row.eventType).startsWith('quality.'))).toBe(true);

    const outboxEvents = await request(app).get('/api/control-center/outbox-events?page=1&limit=50').set(auth());
    expect(outboxEvents.status).toBe(200);
    expect(outboxEvents.body.data.some((row: any) => String(row.eventType).startsWith('quality.'))).toBe(true);

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const response = await request(app).get(`/api/control-center/dashboard/${section}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const [notification, task, activity] = await Promise.all([
      prisma.notification.findUnique({ where: { id: notificationId } }),
      prisma.userTask.findUnique({ where: { id: taskId } }),
      request(app).get('/api/control-center/dashboard/activity').set(auth())
    ]);

    expect(notification?.isRead).toBe(true);
    expect(task?.status).toBe('DONE');
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: any) => String(row.title).startsWith('quality.'))).toBe(true);
    },
    60000
  );
});
