import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

jest.setTimeout(60000);

describe('Stage 3 workflow coverage', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('supports tax category details endpoint', async () => {
    const create = await request(app)
      .post('/api/tax-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('TAXCAT'),
        nameAr: 'Tax Category Stage3',
        rate: 15,
        isActive: true
      });
    expect(create.status).toBe(201);
    const id = Number(create.body.data.id);
    expect(id).toBeGreaterThan(0);

    const details = await request(app).get(`/api/tax-categories/${id}`).set('Authorization', `Bearer ${token}`);
    expect(details.status).toBe(200);
    expect(details.body.success).toBe(true);
    expect(Number(details.body.data.id)).toBe(id);
  });

  it('enforces payroll lifecycle transitions', async () => {
    const employee = await prisma.employee.create({
      data: {
        code: uniqueCode('EMP3'),
        fullName: 'Stage3 Payroll Employee',
        status: 'ACTIVE',
        baseSalary: 2000,
        allowances: 250
      }
    });
    expect(employee.id).toBeGreaterThan(0);

    const year = 2098;
    const month = 7;
    const generate = await request(app)
      .post('/api/payroll/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ year, month });
    expect(generate.status).toBe(201);
    const payrollId = Number(generate.body.data.id);
    expect(payrollId).toBeGreaterThan(0);

    const postBeforeApprove = await request(app).post(`/api/payroll/${payrollId}/post`).set('Authorization', `Bearer ${token}`).send({});
    expect(postBeforeApprove.status).toBe(400);

    const approve = await request(app).post(`/api/payroll/${payrollId}/approve`).set('Authorization', `Bearer ${token}`).send({});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const approveAgain = await request(app).post(`/api/payroll/${payrollId}/approve`).set('Authorization', `Bearer ${token}`).send({});
    expect(approveAgain.status).toBe(400);

    const payBeforePost = await request(app).post(`/api/payroll/${payrollId}/pay`).set('Authorization', `Bearer ${token}`).send({});
    expect(payBeforePost.status).toBe(400);

    const post = await request(app).post(`/api/payroll/${payrollId}/post`).set('Authorization', `Bearer ${token}`).send({});
    expect(post.status).toBe(200);
    expect(post.body.data.status).toBe('POSTED');
    expect(post.body.data.journalEntryId).toBeTruthy();

    const payrollEntry = await prisma.journalEntry.findFirst({
      where: { reference: `PAYROLL-RUN-${payrollId}` },
      include: { lines: true },
      orderBy: { id: 'desc' }
    });
    expect(payrollEntry).toBeTruthy();
    expect(payrollEntry!.status).toBe('POSTED');
    expect(payrollEntry!.lines.length).toBe(2);
    expect(Number(payrollEntry!.totalDebit)).toBeCloseTo(Number(payrollEntry!.totalCredit), 2);

    const pay = await request(app).post(`/api/payroll/${payrollId}/pay`).set('Authorization', `Bearer ${token}`).send({});
    expect(pay.status).toBe(200);
    expect(pay.body.data.status).toBe('PAID');

    const postAfterPay = await request(app).post(`/api/payroll/${payrollId}/post`).set('Authorization', `Bearer ${token}`).send({});
    expect(postAfterPay.status).toBe(400);
  });

  it('enforces leave approval/rejection lifecycle', async () => {
    const employee = await prisma.employee.create({
      data: {
        code: uniqueCode('LVE3'),
        fullName: 'Stage3 Leave Employee',
        status: 'ACTIVE'
      }
    });
    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        type: 'ANNUAL',
        startDate: new Date('2098-01-10T00:00:00.000Z'),
        endDate: new Date('2098-01-12T00:00:00.000Z'),
        daysCount: 3,
        status: 'PENDING'
      }
    });

    const approve = await request(app).post(`/api/leaves/${leave.id}/approve`).set('Authorization', `Bearer ${token}`).send({});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const rejectAfterApprove = await request(app).post(`/api/leaves/${leave.id}/reject`).set('Authorization', `Bearer ${token}`).send({});
    expect(rejectAfterApprove.status).toBe(400);
  });

  it('enforces contracts and milestones lifecycle', async () => {
    const contract = await prisma.contract.create({
      data: {
        number: uniqueCode('CON3'),
        title: 'Stage3 Contract',
        partyType: 'SUPPLIER',
        startDate: new Date('2098-02-01T00:00:00.000Z'),
        status: 'DRAFT'
      }
    });

    const renewBeforeApprove = await request(app)
      .post(`/api/contracts/${contract.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ months: 12 });
    expect(renewBeforeApprove.status).toBe(400);

    const approve = await request(app).post(`/api/contracts/${contract.id}/approve`).set('Authorization', `Bearer ${token}`).send({});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const milestoneCreate = await request(app)
      .post(`/api/contracts/${contract.id}/milestones`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Stage3 Milestone',
        amount: 500,
        status: 'PENDING'
      });
    expect(milestoneCreate.status).toBe(201);
    const milestoneId = Number(milestoneCreate.body.data.id);
    expect(milestoneId).toBeGreaterThan(0);

    const complete = await request(app).post(`/api/milestones/${milestoneId}/complete`).set('Authorization', `Bearer ${token}`).send({});
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('COMPLETED');

    const completeAgain = await request(app)
      .post(`/api/milestones/${milestoneId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(completeAgain.status).toBe(400);

    const terminate = await request(app).post(`/api/contracts/${contract.id}/terminate`).set('Authorization', `Bearer ${token}`).send({});
    expect(terminate.status).toBe(200);
    expect(terminate.body.data.status).toBe('TERMINATED');

    const renewAfterTerminate = await request(app)
      .post(`/api/contracts/${contract.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ months: 6 });
    expect(renewAfterTerminate.status).toBe(400);
  });

  it('covers projects, support tickets and help endpoints', async () => {
    const projectCreate = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('PRJ3'),
        nameAr: 'Stage3 Project',
        status: 'Active',
        actualCost: 0,
        isActive: true
      });
    expect(projectCreate.status).toBe(201);
    const projectId = Number(projectCreate.body.data.id);
    expect(projectId).toBeGreaterThan(0);

    const taskCreate = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Stage3 Task',
        priority: 'MEDIUM',
        status: 'TODO',
        progress: 0,
        estimatedHours: 4
      });
    expect(taskCreate.status).toBe(201);

    const tasksList = await request(app).get(`/api/projects/${projectId}/tasks`).set('Authorization', `Bearer ${token}`);
    expect(tasksList.status).toBe(200);
    expect(tasksList.body.success).toBe(true);
    expect(Array.isArray(tasksList.body.data)).toBe(true);

    const expenseCreate = await request(app)
      .post(`/api/projects/${projectId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: new Date().toISOString(),
        amount: 120,
        category: 'Operations',
        description: 'Stage3 Project Expense'
      });
    expect(expenseCreate.status).toBe(201);
    const expenseId = Number(expenseCreate.body.data.id);
    expect(expenseId).toBeGreaterThan(0);

    const expenseUpdate = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Stage3 Project Expense Updated' });
    expect(expenseUpdate.status).toBe(200);

    const supportCreate = await request(app)
      .post('/api/support-tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        number: uniqueCode('SUPT3'),
        subject: 'Stage3 Support Ticket',
        priority: 'MEDIUM',
        status: 'OPEN'
      });
    expect(supportCreate.status).toBe(201);

    const supportList = await request(app).get('/api/support-tickets').set('Authorization', `Bearer ${token}`);
    expect(supportList.status).toBe(200);
    expect(supportList.body.success).toBe(true);

    const helpArticles = await request(app).get('/api/help-center/articles').set('Authorization', `Bearer ${token}`);
    expect(helpArticles.status).toBe(200);
    expect(helpArticles.body.success).toBe(true);

    const kbSearch = await request(app)
      .get('/api/knowledge-base/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'فاتورة' });
    expect(kbSearch.status).toBe(200);
    expect(kbSearch.body.success).toBe(true);
  });
});
