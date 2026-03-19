import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('HR attendance and timesheets v1', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('tracks attendance and approves timesheets into project costs', async () => {
    let employeeId = 0;
    let projectId = 0;
    let attendanceId = 0;
    let timesheetId = 0;

    try {
      const employeeRes = await request(app)
        .post('/api/v1/hr/employees')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'فني تشغيل موقع',
          position: 'Site Technician',
          baseSalary: 900,
          allowances: 150
        });

      expect(employeeRes.status).toBe(201);
      employeeId = Number(employeeRes.body.data.id);

      const projectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('PRJ-TS'),
          nameAr: 'مشروع تحميل ساعات عمل',
          status: 'Active',
          isActive: true,
          actualCost: 0
        });

      expect(projectRes.status).toBe(201);
      projectId = Number(projectRes.body.data.id);

      const attendanceRes = await request(app)
        .post('/api/v1/hr/attendance')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId,
          date: '2026-03-10T00:00:00.000Z',
          checkIn: '2026-03-10T08:00:00.000Z',
          checkOut: '2026-03-10T17:00:00.000Z'
        });

      expect(attendanceRes.status).toBe(201);
      attendanceId = Number(attendanceRes.body.data.id);
      expect(Number(attendanceRes.body.data.hoursWorked)).toBeCloseTo(9, 3);

      const timesheetRes = await request(app)
        .post('/api/v1/hr/timesheets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId,
          projectId,
          date: '2026-03-10T00:00:00.000Z',
          hours: 8,
          hourlyCost: 5.5,
          description: 'تحميل ساعات فريق التشغيل'
        });

      expect(timesheetRes.status).toBe(201);
      timesheetId = Number(timesheetRes.body.data.id);
      expect(Number(timesheetRes.body.data.amount)).toBeCloseTo(44, 3);

      const updateTimesheetRes = await request(app)
        .put(`/api/v1/hr/timesheets/${timesheetId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          hours: 9,
          hourlyCost: 6
        });

      expect(updateTimesheetRes.status).toBe(200);
      expect(Number(updateTimesheetRes.body.data.amount)).toBeCloseTo(54, 3);

      const approveTimesheetRes = await request(app)
        .post(`/api/v1/hr/timesheets/${timesheetId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(approveTimesheetRes.status).toBe(200);
      expect(approveTimesheetRes.body.data.status).toBe('APPROVED');
      expect(Number(approveTimesheetRes.body.data.projectExpenseId)).toBeGreaterThan(0);

      const timesheetGetRes = await request(app)
        .get(`/api/v1/hr/timesheets/${timesheetId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(timesheetGetRes.status).toBe(200);
      expect(timesheetGetRes.body.data.project.nameAr).toBe('مشروع تحميل ساعات عمل');

      const projectSummaryRes = await request(app)
        .get(`/api/v1/projects/${projectId}/cost-summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(projectSummaryRes.status).toBe(200);
      expect(Number(projectSummaryRes.body.data.summary.actualCost)).toBeCloseTo(54, 3);

      const eventsRes = await request(app)
        .get('/api/v1/accounting/events?limit=100')
        .set('Authorization', `Bearer ${token}`);

      expect(eventsRes.status).toBe(200);
      const eventNames = eventsRes.body.data.map((event: { name: string }) => event.name);
      expect(eventNames).toContain('project.expense.recorded');
    } finally {
      if (timesheetId) {
        await prisma.timesheet.deleteMany({ where: { id: timesheetId } });
      }
      if (attendanceId) {
        await prisma.attendance.deleteMany({ where: { id: attendanceId } });
      }
      if (projectId) {
        await prisma.projectExpense.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (employeeId) {
        await prisma.employee.deleteMany({ where: { id: employeeId } });
      }
    }
  });
});
