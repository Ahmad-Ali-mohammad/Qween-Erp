import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

jest.setTimeout(60000);

type PostingContext = {
  dateIso: string;
  fiscalYear: number;
  periodNumber: number;
  periodId?: number;
  fiscalYearId?: number;
};

describe('Stage 19 deep CRUD coverage (Payroll + Tax/Currency + Audit/Internal Controls)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  async function ensureOpenPostingContext(): Promise<PostingContext> {
    const form = await request(app).get('/api/quick-journal/form-data').set(auth());
    expect(form.status).toBe(200);
    const periods = Array.isArray(form.body?.data?.periods) ? form.body.data.periods : [];
    if (periods.length > 0) {
      const period = periods[0];
      const date = new Date(String(period.startDate ?? new Date().toISOString()));
      return {
        dateIso: date.toISOString(),
        fiscalYear: Number(new Date(String(period.fiscalYear?.startDate ?? date)).getUTCFullYear()),
        periodNumber: Number(period.number),
        periodId: Number(period.id),
        fiscalYearId: Number(period.fiscalYearId)
      };
    }

    const futureYear = 3700 + Number(String(Date.now()).slice(-3));
    const fy = await request(app).post('/api/fiscal-years').set(auth()).send({
      name: `FY-ST19-${futureYear}`,
      startDate: `${futureYear}-01-01T00:00:00.000Z`,
      endDate: `${futureYear}-12-31`,
      status: 'OPEN',
      isCurrent: false
    });
    expect(fy.status).toBe(201);
    const fiscalYearId = Number(fy.body.data.id);

    const period = await request(app).post('/api/periods').set(auth()).send({
      fiscalYearId,
      number: 1,
      name: `P01-${futureYear}`,
      startDate: `${futureYear}-01-01T00:00:00.000Z`,
      endDate: `${futureYear}-01-31`,
      status: 'OPEN',
      canPost: true
    });
    expect(period.status).toBe(201);

    return {
      dateIso: `${futureYear}-01-15T00:00:00.000Z`,
      fiscalYear: futureYear,
      periodNumber: 1,
      periodId: Number(period.body.data.id),
      fiscalYearId
    };
  }

  it('covers payroll full lifecycle + audit logs + internal-control alerts', async () => {
    const ctx = await ensureOpenPostingContext();
    const employeeCode = uniqueCode('EMP19').toUpperCase();
    const alertKey = `internal-control:alert:${uniqueCode('IC19').toLowerCase()}`;

    const admin = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
    expect(admin).toBeTruthy();
    const adminUserId = Number(admin!.id);

    let employeeId = 0;
    let payrollRunId = 0;
    let payrollJournalEntryId = 0;
    let alertId = 0;
    let auditLogId = 0;

    try {
      const employeeCreate = await request(app).post('/api/employees').set(auth()).send({
        code: employeeCode,
        fullName: 'Stage 19 Payroll Employee',
        status: 'ACTIVE',
        baseSalary: 4500,
        allowances: 500
      });
      expect(employeeCreate.status).toBe(201);
      employeeId = Number(employeeCreate.body.data.id);

      const runGenerate = await request(app).post('/api/payroll/generate').set(auth()).send({
        year: new Date(ctx.dateIso).getUTCFullYear(),
        month: new Date(ctx.dateIso).getUTCMonth() + 1
      });
      expect(runGenerate.status).toBe(201);
      payrollRunId = Number(runGenerate.body.data.id);

      const runList = await request(app).get('/api/payroll').set(auth());
      expect(runList.status).toBe(200);
      expect(Array.isArray(runList.body.data)).toBe(true);

      const runGet = await request(app).get(`/api/payroll/${payrollRunId}`).set(auth());
      expect(runGet.status).toBe(200);
      expect(Array.isArray(runGet.body.data.lines)).toBe(true);

      const runApprove = await request(app).post(`/api/payroll/${payrollRunId}/approve`).set(auth()).send({});
      expect(runApprove.status).toBe(200);
      expect(String(runApprove.body.data.status)).toBe('APPROVED');

      const runPost = await request(app)
        .post(`/api/payroll/${payrollRunId}/post`)
        .set(auth())
        .send({ postingDate: ctx.dateIso, description: 'Stage19 payroll post' });
      expect(runPost.status).toBe(200);
      expect(String(runPost.body.data.status)).toBe('POSTED');
      payrollJournalEntryId = Number(runPost.body.data.journalEntryId ?? 0);

      const runPay = await request(app).post(`/api/payroll/${payrollRunId}/pay`).set(auth()).send({});
      expect(runPay.status).toBe(200);
      expect(String(runPay.body.data.status)).toBe('PAID');

      const auditCreate = await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          table: 'stage19',
          action: 'TEST',
          recordId: payrollRunId,
          newValue: { runId: payrollRunId } as any
        }
      });
      auditLogId = auditCreate.id;

      const auditList = await request(app).get('/api/audit-logs').set(auth()).query({ table: 'stage19', limit: 20 });
      expect(auditList.status).toBe(200);
      expect(Array.isArray(auditList.body.data)).toBe(true);
      expect(auditList.body.data.some((r: any) => Number(r.id) === auditLogId)).toBe(true);

      const auditGet = await request(app).get(`/api/audit-logs/${auditLogId}`).set(auth());
      expect(auditGet.status).toBe(200);
      expect(Number(auditGet.body.data.id)).toBe(auditLogId);

      const alert = await prisma.integrationSetting.create({
        data: {
          key: alertKey,
          provider: 'SYSTEM',
          isEnabled: true,
          status: 'OPEN',
          settings: { severity: 'HIGH', message: 'Stage19 internal control alert' } as any
        }
      });
      alertId = alert.id;

      const alerts = await request(app).get('/api/internal-control/alerts').set(auth());
      expect(alerts.status).toBe(200);
      expect(Array.isArray(alerts.body.data)).toBe(true);
      expect(alerts.body.data.some((r: any) => Number(r.id) === alertId)).toBe(true);

      const resolve = await request(app).post(`/api/internal-control/resolve/${alertId}`).set(auth()).send({});
      expect(resolve.status).toBe(200);
      expect(String(resolve.body.data.status)).toBe('RESOLVED');
    } finally {
      if (alertId) await prisma.integrationSetting.deleteMany({ where: { id: alertId } });
      if (auditLogId) await prisma.auditLog.deleteMany({ where: { id: auditLogId } });
      if (payrollRunId) {
        await prisma.payrollLine.deleteMany({ where: { payrollRunId } });
        await prisma.payrollRun.deleteMany({ where: { id: payrollRunId } });
      }
      if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
      if (ctx.periodId && ctx.fiscalYearId && ctx.fiscalYear > 3700) {
        await prisma.accountingPeriod.deleteMany({ where: { id: ctx.periodId } });
        await prisma.fiscalYear.deleteMany({ where: { id: ctx.fiscalYearId } });
      }
      void payrollJournalEntryId;
    }
  });

  it('covers tax declaration submit/pay + ZATCA + currency revaluation workflow', async () => {
    const ctx = await ensureOpenPostingContext();
    const currencyCode = uniqueCode('C19').slice(0, 6).toUpperCase();
    const bankAccountNumber = uniqueCode('BA19').toUpperCase();

    const form = await request(app).get('/api/quick-journal/form-data').set(auth());
    expect(form.status).toBe(200);
    const postingAccounts = Array.isArray(form.body?.data?.accounts) ? form.body.data.accounts : [];
    expect(postingAccounts.length).toBeGreaterThanOrEqual(1);
    const cashAccountId = Number(postingAccounts[0].id);

    let declarationId = 0;
    let rate1Id = 0;
    let rate2Id = 0;
    let bankId = 0;

    try {
      const declarationCreate = await request(app).post('/api/tax-declarations').set(auth()).send({
        periodStart: ctx.dateIso.slice(0, 10),
        periodEnd: ctx.dateIso.slice(0, 10),
        type: 'VAT',
        totalSales: 1000,
        totalPurchases: 500,
        outputTax: 150,
        inputTax: 75,
        netPayable: 75,
        status: 'DRAFT'
      });
      expect(declarationCreate.status).toBe(201);
      declarationId = Number(declarationCreate.body.data.id);

      const declarationSubmit = await request(app).post(`/api/tax-declarations/${declarationId}/submit`).set(auth()).send({
        filedDate: ctx.dateIso,
        filedReference: 'ST19-FILED'
      });
      expect(declarationSubmit.status).toBe(200);
      expect(String(declarationSubmit.body.data.status)).toBe('FILED');

      const declarationPay = await request(app).post(`/api/tax-declarations/${declarationId}/pay`).set(auth()).send({
        paidDate: ctx.dateIso,
        paidReference: 'ST19-PAID',
        cashAccountId
      });
      expect(declarationPay.status).toBe(200);
      expect(String(declarationPay.body.data.status)).toBe('PAID');

      const zatcaPut = await request(app).put('/api/zatca/settings').set(auth()).send({
        isEnabled: true,
        environment: 'sandbox',
        endpoint: 'https://example.com/zatca'
      });
      expect(zatcaPut.status).toBe(200);

      const zatcaTest = await request(app).post('/api/zatca/test-connection').set(auth()).send({});
      expect(zatcaTest.status).toBe(200);
      expect(Boolean(zatcaTest.body.data.connected)).toBe(true);

      const zatcaCompliance = await request(app).get('/api/zatca/compliance').set(auth());
      expect(zatcaCompliance.status).toBe(200);
      expect(Boolean(zatcaCompliance.body.data.enabled)).toBe(true);

      const currencyCreate = await request(app).post('/api/currencies').set(auth()).send({
        code: currencyCode,
        nameAr: 'عملة مرحلة 19',
        symbol: '$',
        isBase: false,
        isActive: true
      });
      expect(currencyCreate.status).toBe(201);

      const d0 = new Date(ctx.dateIso);
      const d1 = new Date(d0);
      d1.setUTCDate(d1.getUTCDate() - 1);
      const d2 = new Date(d0);
      d2.setUTCDate(d2.getUTCDate() - 2);

      const rate1 = await request(app).post('/api/exchange-rates').set(auth()).send({
        currencyCode,
        rateDate: d2.toISOString(),
        rate: 3.5,
        source: 'manual'
      });
      expect(rate1.status).toBe(201);
      rate1Id = Number(rate1.body.data.id);

      const rate2 = await request(app).post('/api/exchange-rates').set(auth()).send({
        currencyCode,
        rateDate: d1.toISOString(),
        rate: 3.8,
        source: 'manual'
      });
      expect(rate2.status).toBe(201);
      rate2Id = Number(rate2.body.data.id);

      const bankCreate = await request(app).post('/api/bank-accounts').set(auth()).send({
        name: 'Stage19 FX Bank',
        accountNumber: bankAccountNumber,
        bankName: 'FX Bank',
        accountType: 'BANK',
        currency: currencyCode,
        glAccountId: cashAccountId,
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      });
      expect(bankCreate.status).toBe(201);
      bankId = Number(bankCreate.body.data.id);

      const revaluate = await request(app).post('/api/currency/revaluate').set(auth()).send({
        asOfDate: d0.toISOString(),
        baseCurrency: 'SAR',
        minDifference: 0
      });
      expect([200, 202]).toContain(revaluate.status);
      expect(revaluate.body).toHaveProperty('data.summary');

      const currencyDiffReport = await request(app).get('/api/reports/currency-differences').set(auth());
      expect(currencyDiffReport.status).toBe(200);
      expect(Array.isArray(currencyDiffReport.body.data)).toBe(true);
    } finally {
      if (bankId) await request(app).delete(`/api/bank-accounts/${bankId}`).set(auth());
      if (rate2Id) await request(app).delete(`/api/exchange-rates/${rate2Id}`).set(auth());
      if (rate1Id) await request(app).delete(`/api/exchange-rates/${rate1Id}`).set(auth());
      if (currencyCode) await request(app).delete(`/api/currencies/${currencyCode}`).set(auth());
      if (declarationId) await request(app).delete(`/api/tax-declarations/${declarationId}`).set(auth());
      if (ctx.periodId && ctx.fiscalYearId && ctx.fiscalYear > 3700) {
        await prisma.accountingPeriod.deleteMany({ where: { id: ctx.periodId } });
        await prisma.fiscalYear.deleteMany({ where: { id: ctx.fiscalYearId } });
      }
    }
  });
});
