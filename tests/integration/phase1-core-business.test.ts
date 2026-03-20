import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Phase 1 core business slice', () => {
  let token = '';
  let branchId = 0;
  let customerId = 0;
  let opportunityId = 0;
  let contractId = 0;
  let projectId = 0;
  let employeeId = 0;
  let timesheetId = 0;
  let payrollRunId = 0;
  let projectExpenseId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (timesheetId) await prisma.timesheet.deleteMany({ where: { id: timesheetId } });
    if (projectExpenseId) await prisma.projectExpense.deleteMany({ where: { id: projectExpenseId } });
    if (payrollRunId) {
      await prisma.payrollLine.deleteMany({ where: { payrollRunId } });
      await prisma.payrollRun.deleteMany({ where: { id: payrollRunId } });
    }
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (contractId) await prisma.contract.deleteMany({ where: { id: contractId } });
    if (opportunityId) await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('awards an opportunity into contract/project and distributes labor cost from payroll to projects', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع المرحلة الأولى'
        }
      })
    ).id;

    customerId = (
      await prisma.customer.create({
        data: {
          code: uniqueCode('CUS'),
          nameAr: 'عميل ربط المرحلة الأولى',
          branchId
        }
      })
    ).id;

    opportunityId = (
      await prisma.opportunity.create({
        data: {
          title: 'فرصة مشروع متكامل',
          customerId,
          stage: 'NEGOTIATION',
          probability: 70,
          value: 20000,
          ownerId: 1,
          status: 'OPEN'
        }
      })
    ).id;

    const awardRes = await request(app).post(`/api/crm/opportunities/${opportunityId}/award`).set(auth()).send({
      branchId,
      startDate: '2026-03-01',
      endDate: '2026-09-30',
      contractValue: 20000,
      projectNameAr: 'مشروع التنفيذ الميداني'
    });

    expect(awardRes.status).toBe(200);
    contractId = Number(awardRes.body.data.contract.id);
    projectId = Number(awardRes.body.data.project.id);
    expect(awardRes.body.data.opportunity.status).toBe('WON');
    expect(Number(awardRes.body.data.project.contractId)).toBe(contractId);

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'موظف توزيع الرواتب',
          branchId,
          status: 'ACTIVE',
          baseSalary: 2500,
          allowances: 300
        }
      })
    ).id;

    const timesheetRes = await request(app).post('/api/hr/timesheets').set(auth()).send({
      branchId,
      employeeId,
      projectId,
      date: '2026-03-05',
      hours: 8,
      hourlyCost: 25,
      description: 'تنفيذ أعمال ميدانية'
    });

    expect(timesheetRes.status).toBe(201);
    timesheetId = Number(timesheetRes.body.data.id);
    expect(Number(timesheetRes.body.data.amount)).toBe(200);

    const approveTimesheetRes = await request(app).post(`/api/hr/timesheets/${timesheetId}/approve`).set(auth()).send({});
    expect(approveTimesheetRes.status).toBe(200);
    expect(approveTimesheetRes.body.data.status).toBe('APPROVED');

    const generatePayrollRes = await request(app).post('/api/hr/payroll/generate').set(auth()).send({
      year: 2026,
      month: 3
    });
    expect(generatePayrollRes.status).toBe(201);
    payrollRunId = Number(generatePayrollRes.body.data.id);

    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: { branchId }
    });

    const approvePayrollRes = await request(app).post(`/api/hr/payroll/${payrollRunId}/approve`).set(auth()).send({});
    expect(approvePayrollRes.status).toBe(200);

    const distributeRes = await request(app).post(`/api/hr/payroll/${payrollRunId}/distribute`).set(auth()).send({});
    expect(distributeRes.status).toBe(200);
    expect(distributeRes.body.data.distributedTimesheets).toBe(1);
    expect(Number(distributeRes.body.data.totalAmount)).toBe(200);
    projectExpenseId = Number(distributeRes.body.data.expenseIds[0]);

    const [timesheet, expense, project, opportunity, events] = await Promise.all([
      prisma.timesheet.findUnique({ where: { id: timesheetId } }),
      prisma.projectExpense.findUnique({ where: { id: projectExpenseId } }),
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.opportunity.findUnique({ where: { id: opportunityId } }),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'crm.opportunity.awarded',
              'contracts.contract.activated',
              'projects.project.created',
              'hr.timesheet.created',
              'hr.timesheet.approved',
              'hr.payroll.distributed'
            ]
          }
        }
      })
    ]);

    expect(opportunity?.status).toBe('WON');
    expect(Number(timesheet?.projectExpenseId)).toBe(projectExpenseId);
    expect(expense?.category).toBe('LABOR');
    expect(Number(expense?.amount)).toBe(200);
    expect(Number(project?.actualCost)).toBe(200);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('crm.opportunity.awarded')).toBe(true);
    expect(eventTypes.has('contracts.contract.activated')).toBe(true);
    expect(eventTypes.has('projects.project.created')).toBe(true);
    expect(eventTypes.has('hr.timesheet.created')).toBe(true);
    expect(eventTypes.has('hr.timesheet.approved')).toBe(true);
    expect(eventTypes.has('hr.payroll.distributed')).toBe(true);
  });
});
