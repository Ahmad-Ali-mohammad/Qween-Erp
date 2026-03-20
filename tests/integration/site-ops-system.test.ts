import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Site operations system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let itemId = 0;
  let warehouseId = 0;
  let employeeId = 0;
  let dailyLogId = 0;
  let materialRequestId = 0;
  let issueId = 0;
  let attendanceId = 0;
  let materialRequestNumber = '';
  let attendanceDate = '';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (attendanceId) await prisma.siteAttendance.deleteMany({ where: { id: attendanceId } });
    if (issueId) await prisma.siteIssue.deleteMany({ where: { id: issueId } });
    if (materialRequestId) await prisma.siteMaterialRequest.deleteMany({ where: { id: materialRequestId } });
    if (dailyLogId) await prisma.siteDailyLog.deleteMany({ where: { id: dailyLogId } });
    if (materialRequestNumber) await prisma.stockMovement.deleteMany({ where: { reference: materialRequestNumber } });
    if (employeeId && attendanceDate) {
      await prisma.attendance.deleteMany({
        where: {
          employeeId,
          date: new Date(attendanceDate)
        }
      });
    }
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (itemId) await prisma.item.deleteMany({ where: { id: itemId } });
    if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs site daily, material, issue, and attendance flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع التشغيل الميداني'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع التشغيل الميداني',
          branchId,
          budget: 100000
        }
      })
    ).id;

    itemId = (
      await prisma.item.create({
        data: {
          code: uniqueCode('ITM'),
          nameAr: 'أسمنت تشغيل ميداني',
          purchasePrice: 10,
          onHandQty: 50,
          inventoryValue: 500
        }
      })
    ).id;

    warehouseId = (
      await prisma.warehouse.create({
        data: {
          code: uniqueCode('WH'),
          nameAr: 'مستودع التشغيل',
          branchId
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'عامل ميداني',
          branchId,
          status: 'ACTIVE',
          baseSalary: 1500
        }
      })
    ).id;

    const dailyCreate = await request(app).post('/api/site-ops/daily-logs').set(auth()).send({
      projectId,
      logDate: '2026-03-19',
      weather: 'Sunny',
      workforceCount: 22,
      workExecuted: 'صب أرضية الطابق الأول',
      blockers: 'تأخير شاحنة مواد واحدة'
    });
    expect(dailyCreate.status).toBe(201);
    dailyLogId = Number(dailyCreate.body.data.id);

    const dailySubmit = await request(app).post(`/api/site-ops/daily-logs/${dailyLogId}/submit`).set(auth()).send({});
    expect(dailySubmit.status).toBe(200);
    expect(dailySubmit.body.data.status).toBe('SUBMITTED');

    const dailyApprove = await request(app).post(`/api/site-ops/daily-logs/${dailyLogId}/approve`).set(auth()).send({});
    expect(dailyApprove.status).toBe(200);
    expect(dailyApprove.body.data.approvalStatus).toBe('APPROVED');

    const materialCreate = await request(app).post('/api/site-ops/material-requests').set(auth()).send({
      projectId,
      dailyLogId,
      itemId,
      warehouseId,
      quantity: 5,
      requiredBy: '2026-03-20',
      purpose: 'صب منطقة الخدمات'
    });
    expect(materialCreate.status).toBe(201);
    materialRequestId = Number(materialCreate.body.data.id);
    materialRequestNumber = String(materialCreate.body.data.number || '');

    const materialSubmit = await request(app).post(`/api/site-ops/material-requests/${materialRequestId}/submit`).set(auth()).send({});
    expect(materialSubmit.status).toBe(200);
    expect(materialSubmit.body.data.approvalStatus).toBe('PENDING');

    const materialApprove = await request(app).post(`/api/site-ops/material-requests/${materialRequestId}/approve`).set(auth()).send({});
    expect(materialApprove.status).toBe(200);
    expect(materialApprove.body.data.approvalStatus).toBe('APPROVED');

    const materialFulfill = await request(app).post(`/api/site-ops/material-requests/${materialRequestId}/fulfill`).set(auth()).send({
      issuedQuantity: 5
    });
    expect(materialFulfill.status).toBe(200);
    expect(materialFulfill.body.data.status).toBe('FULFILLED');
    expect(Number(materialFulfill.body.data.issuedQuantity)).toBe(5);

    const issueCreate = await request(app).post('/api/site-ops/issues').set(auth()).send({
      projectId,
      dailyLogId,
      severity: 'HIGH',
      title: 'تعطل رافعة خفيفة',
      description: 'تم إيقاف التشغيل حتى وصول فني الصيانة'
    });
    expect(issueCreate.status).toBe(201);
    issueId = Number(issueCreate.body.data.id);

    const issueResolve = await request(app).post(`/api/site-ops/issues/${issueId}/resolve`).set(auth()).send({});
    expect(issueResolve.status).toBe(200);
    expect(issueResolve.body.data.status).toBe('RESOLVED');

    attendanceDate = '2026-03-19T00:00:00.000Z';
    const attendanceCreate = await request(app).post('/api/site-ops/attendance').set(auth()).send({
      projectId,
      employeeId,
      date: '2026-03-19',
      hoursWorked: 8,
      status: 'PRESENT'
    });
    expect(attendanceCreate.status).toBe(201);
    attendanceId = Number(attendanceCreate.body.data.id);

    const attendanceSubmit = await request(app).post(`/api/site-ops/attendance/${attendanceId}/submit`).set(auth()).send({});
    expect(attendanceSubmit.status).toBe(200);
    expect(attendanceSubmit.body.data.approvalStatus).toBe('PENDING');

    const attendanceApprove = await request(app).post(`/api/site-ops/attendance/${attendanceId}/approve`).set(auth()).send({});
    expect(attendanceApprove.status).toBe(200);
    expect(attendanceApprove.body.data.approvalStatus).toBe('APPROVED');

    const [siteMaterial, stockMovement, item, project, issue, siteAttendance, attendance, dashboard, events] = await Promise.all([
      prisma.siteMaterialRequest.findUnique({ where: { id: materialRequestId } }),
      prisma.stockMovement.findFirst({ where: { reference: materialRequestNumber } }),
      prisma.item.findUnique({ where: { id: itemId } }),
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.siteIssue.findUnique({ where: { id: issueId } }),
      prisma.siteAttendance.findUnique({ where: { id: attendanceId } }),
      prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId,
            date: new Date(attendanceDate)
          }
        }
      }),
      request(app).get('/api/site-ops/dashboard/summary').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'site-ops.daily-log.created',
              'site-ops.daily-log.submitted',
              'site-ops.daily-log.approved',
              'site-ops.material-request.created',
              'site-ops.material-request.submitted',
              'site-ops.material-request.approved',
              'site-ops.material-request.fulfilled',
              'site-ops.issue.created',
              'site-ops.issue.resolved',
              'site-ops.attendance.upserted',
              'site-ops.attendance.submitted',
              'site-ops.attendance.approved'
            ]
          }
        }
      })
    ]);

    expect(siteMaterial?.status).toBe('FULFILLED');
    expect(Number(siteMaterial?.issuedQuantity)).toBe(5);
    expect(stockMovement?.type).toBe('ISSUE_SITE');
    expect(Number(item?.onHandQty)).toBe(45);
    expect(Number(project?.actualCost)).toBe(50);
    expect(issue?.status).toBe('RESOLVED');
    expect(siteAttendance?.approvalStatus).toBe('APPROVED');
    expect(Number(attendance?.hoursWorked)).toBe(8);
    expect(dashboard.status).toBe(200);
    expect(Array.isArray(dashboard.body.data)).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('site-ops.daily-log.created')).toBe(true);
    expect(eventTypes.has('site-ops.daily-log.submitted')).toBe(true);
    expect(eventTypes.has('site-ops.daily-log.approved')).toBe(true);
    expect(eventTypes.has('site-ops.material-request.created')).toBe(true);
    expect(eventTypes.has('site-ops.material-request.submitted')).toBe(true);
    expect(eventTypes.has('site-ops.material-request.approved')).toBe(true);
    expect(eventTypes.has('site-ops.material-request.fulfilled')).toBe(true);
    expect(eventTypes.has('site-ops.issue.created')).toBe(true);
    expect(eventTypes.has('site-ops.issue.resolved')).toBe(true);
    expect(eventTypes.has('site-ops.attendance.upserted')).toBe(true);
    expect(eventTypes.has('site-ops.attendance.submitted')).toBe(true);
    expect(eventTypes.has('site-ops.attendance.approved')).toBe(true);
  });
});
