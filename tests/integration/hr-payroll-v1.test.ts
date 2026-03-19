import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('HR v1 employees, leaves, and payroll flow', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('manages employees and executes payroll from draft to paid', async () => {
    let branchId = 0;
    let employeeId = 0;
    let approvedLeaveId = 0;
    let rejectedLeaveId = 0;
    let payrollRunId = 0;
    let payrollLineId = 0;
    let journalEntryId = 0;
    let fiscalYearId = 0;
    let periodId = 0;

    try {
      const branch = await prisma.branch.create({
        data: {
          code: uniqueCode('BR-HR'),
          nameAr: 'فرع الموارد البشرية'
        }
      });
      branchId = branch.id;

      const existingPeriod = await prisma.accountingPeriod.findFirst({
        where: {
          startDate: { lte: new Date('2026-01-15T00:00:00.000Z') },
          endDate: { gte: new Date('2026-01-15T00:00:00.000Z') },
          status: 'OPEN',
          canPost: true
        },
        include: { fiscalYear: true }
      });

      if (!existingPeriod) {
        const fiscalYear = await prisma.fiscalYear.create({
          data: {
            name: uniqueCode('FY-HR'),
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T23:59:59.000Z'),
            status: 'OPEN'
          }
        });
        fiscalYearId = fiscalYear.id;

        const period = await prisma.accountingPeriod.create({
          data: {
            fiscalYearId,
            number: 1,
            name: 'يناير 2026 - HR',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-01-31T23:59:59.000Z'),
            status: 'OPEN',
            canPost: true
          }
        });
        periodId = period.id;
      }

      const employeeRes = await request(app)
        .post('/api/v1/hr/employees')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          fullName: 'موظف HR حديث',
          email: `${uniqueCode('emp-hr').toLowerCase()}@erp.local`,
          position: 'Site Engineer',
          baseSalary: 3200,
          allowances: 450
        });

      expect(employeeRes.status).toBe(201);
      expect(employeeRes.body.auditRef).toBeTruthy();
      employeeId = Number(employeeRes.body.data.id);

      const employeesListRes = await request(app)
        .get(`/api/v1/hr/employees?branchId=${branchId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(employeesListRes.status).toBe(200);
      expect(Array.isArray(employeesListRes.body.data)).toBe(true);
      expect(Number(employeesListRes.body.data[0].id)).toBe(employeeId);

      const employeeGetRes = await request(app)
        .get(`/api/v1/hr/employees/${employeeId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(employeeGetRes.status).toBe(200);
      expect(employeeGetRes.body.data.fullName).toBe('موظف HR حديث');

      const employeeUpdateRes = await request(app)
        .put(`/api/v1/hr/employees/${employeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          position: 'Senior Site Engineer',
          phone: '96551111111'
        });
      expect(employeeUpdateRes.status).toBe(200);
      expect(employeeUpdateRes.body.data.position).toBe('Senior Site Engineer');

      const leaveRes = await request(app)
        .post('/api/v1/hr/leaves')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId,
          type: 'ANNUAL',
          startDate: '2026-02-01',
          endDate: '2026-02-03',
          reason: 'إجازة اختبار'
        });
      expect(leaveRes.status).toBe(201);
      approvedLeaveId = Number(leaveRes.body.data.id);

      const approveLeaveRes = await request(app)
        .post(`/api/v1/hr/leaves/${approvedLeaveId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(approveLeaveRes.status).toBe(200);
      expect(approveLeaveRes.body.data.status).toBe('APPROVED');

      const rejectedLeaveRes = await request(app)
        .post('/api/v1/hr/leaves')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId,
          type: 'SICK',
          startDate: '2026-03-02',
          endDate: '2026-03-02',
          reason: 'إجازة مرفوضة'
        });
      expect(rejectedLeaveRes.status).toBe(201);
      rejectedLeaveId = Number(rejectedLeaveRes.body.data.id);

      const rejectLeaveRes = await request(app)
        .post(`/api/v1/hr/leaves/${rejectedLeaveId}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(rejectLeaveRes.status).toBe(200);
      expect(rejectLeaveRes.body.data.status).toBe('REJECTED');

      const payrollGenerateRes = await request(app)
        .post('/api/v1/hr/payroll/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          year: 2026,
          month: 4,
          branchId
        });
      expect(payrollGenerateRes.status).toBe(201);
      payrollRunId = Number(payrollGenerateRes.body.data.id);

      const payrollGetRes = await request(app)
        .get(`/api/v1/hr/payroll/${payrollRunId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(payrollGetRes.status).toBe(200);
      expect(payrollGetRes.body.data.status).toBe('DRAFT');
      expect(payrollGetRes.body.data.lines).toHaveLength(1);
      payrollLineId = Number(payrollGetRes.body.data.lines[0].id);

      const payrollLineUpdateRes = await request(app)
        .put(`/api/v1/hr/payroll/lines/${payrollLineId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          overtime: 120.75,
          deductions: 20.25
        });
      expect(payrollLineUpdateRes.status).toBe(200);
      expect(Number(payrollLineUpdateRes.body.data.netSalary)).toBeCloseTo(3750.5, 3);

      const payrollApproveRes = await request(app)
        .post(`/api/v1/hr/payroll/${payrollRunId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(payrollApproveRes.status).toBe(200);
      expect(payrollApproveRes.body.data.status).toBe('APPROVED');

      const payrollPostRes = await request(app)
        .post(`/api/v1/hr/payroll/${payrollRunId}/post`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          postingDate: '2026-01-15',
          description: 'ترحيل اختبار رواتب v1'
        });
      expect(payrollPostRes.status).toBe(200);
      expect(payrollPostRes.body.data.status).toBe('POSTED');
      expect(payrollPostRes.body.postingRefs).toBeTruthy();
      journalEntryId = Number(payrollPostRes.body.postingRefs.journalEntryId);

      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: { lines: true }
      });
      expect(journalEntry).toBeTruthy();
      expect(journalEntry!.status).toBe('POSTED');
      expect(journalEntry!.reference).toBe(`PAYROLL-RUN-${payrollRunId}`);
      expect(journalEntry!.lines).toHaveLength(2);

      const payrollPayRes = await request(app)
        .post(`/api/v1/hr/payroll/${payrollRunId}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(payrollPayRes.status).toBe(200);
      expect(payrollPayRes.body.data.status).toBe('PAID');

      const finalPayrollRes = await request(app)
        .get(`/api/v1/hr/payroll/${payrollRunId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(finalPayrollRes.status).toBe(200);
      expect(finalPayrollRes.body.data.status).toBe('PAID');
      expect(Number(finalPayrollRes.body.data.netTotal)).toBeCloseTo(3750.5, 3);
    } finally {
      if (journalEntryId) {
        await prisma.journalLine.deleteMany({ where: { entryId: journalEntryId } });
        await prisma.journalEntry.deleteMany({ where: { id: journalEntryId } });
      }
      if (payrollRunId) {
        await prisma.payrollLine.deleteMany({ where: { payrollRunId } });
        await prisma.payrollRun.deleteMany({ where: { id: payrollRunId } });
      }
      if (approvedLeaveId || rejectedLeaveId) {
        await prisma.leaveRequest.deleteMany({ where: { id: { in: [approvedLeaveId, rejectedLeaveId].filter(Boolean) } } });
      }
      if (employeeId) {
        await prisma.employee.deleteMany({ where: { id: employeeId } });
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } });
      }
      if (periodId) {
        await prisma.accountingPeriod.deleteMany({ where: { id: periodId } });
      }
      if (fiscalYearId) {
        await prisma.fiscalYear.deleteMany({ where: { id: fiscalYearId } });
      }
    }
  });
});
