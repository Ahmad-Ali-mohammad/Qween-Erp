import request from 'supertest';
import { app } from '../../src/app';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';
import { prisma } from '../../src/config/database';

describe('Stage 6 reporting workflow coverage', () => {
  let token: string;

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('serves income statement safely without query params', async () => {
    const res = await request(app).get('/api/reports/income-statement').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('period');
    expect(res.body.data).toHaveProperty('totalRevenue');
    expect(res.body.data).toHaveProperty('totalExpenses');
    expect(res.body.data).toHaveProperty('netIncome');
  });

  it('supports fiscalYearId/periodId filters and comparison in income statement', async () => {
    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S6'),
        startDate: '2027-01-01',
        endDate: '2027-12-31'
      });

    expect(fyRes.status).toBe(201);
    const fiscalYearId = fyRes.body.data.id as number;

    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId,
        number: 1,
        name: uniqueCode('P-S6'),
        startDate: '2027-01-01',
        endDate: '2027-01-31'
      });

    expect(periodRes.status).toBe(201);
    const periodId = periodRes.body.data.id as number;

    const res = await request(app)
      .get('/api/reports/income-statement')
      .set('Authorization', `Bearer ${token}`)
      .query({
        fiscalYearId,
        periodId,
        compareWith: 'previous-period'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.compare).toBeTruthy();
    expect(res.body.data.compare).toHaveProperty('netIncome');
    expect(res.body.data.period).toHaveProperty('dateFrom');
    expect(res.body.data.period).toHaveProperty('dateTo');
  });

  it('serves balance sheet safely with invalid or missing asOfDate', async () => {
    const invalidDate = await request(app)
      .get('/api/reports/balance-sheet')
      .set('Authorization', `Bearer ${token}`)
      .query({ asOfDate: 'not-a-date' });

    expect(invalidDate.status).toBe(200);
    expect(invalidDate.body.success).toBe(true);
    expect(invalidDate.body.data).toHaveProperty('totals');
    expect(invalidDate.body.data.totals).toHaveProperty('totalAssets');
    expect(invalidDate.body.data.totals).toHaveProperty('balanced');

    const missingDate = await request(app).get('/api/reports/balance-sheet').set('Authorization', `Bearer ${token}`);
    expect(missingDate.status).toBe(200);
    expect(missingDate.body.success).toBe(true);
  });

  it('accepts fiscalYearId/periodId in trial balance filters', async () => {
    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S6-TB'),
        startDate: '2028-01-01',
        endDate: '2028-12-31'
      });

    expect(fyRes.status).toBe(201);
    const fiscalYearId = fyRes.body.data.id as number;

    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId,
        number: 1,
        name: uniqueCode('P-S6-TB'),
        startDate: '2028-01-01',
        endDate: '2028-01-31'
      });

    expect(periodRes.status).toBe(201);
    const periodId = periodRes.body.data.id as number;

    const res = await request(app)
      .get('/api/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .query({ fiscalYearId, periodId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accounts');
    expect(res.body.data).toHaveProperty('totals');
  });

  it('runs currency revaluation and creates a posted journal entry with idempotency', async () => {
    const glAccount = await prisma.account.findFirst({
      where: { code: '1100' },
      select: { id: true }
    });
    expect(glAccount).toBeTruthy();

    const currencyCode = uniqueCode('FX').toUpperCase().slice(0, 12);
    const bankAccountNumber = uniqueCode('AC');

    const currencyCreate = await request(app)
      .post('/api/currencies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: currencyCode,
        nameAr: `عملة ${currencyCode}`,
        symbol: currencyCode,
        isBase: false,
        isActive: true
      });
    expect(currencyCreate.status).toBe(201);

    const bankCreate = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `FX Bank ${currencyCode}`,
        bankName: 'FX Test Bank',
        accountNumber: bankAccountNumber,
        currency: currencyCode,
        currentBalance: 1000,
        openingBalance: 1000,
        glAccountId: glAccount!.id
      });
    expect(bankCreate.status).toBe(201);

    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S6-FX'),
        startDate: '2029-01-01',
        endDate: '2029-12-31'
      });
    expect(fyRes.status).toBe(201);

    const fyId = fyRes.body.data.id as number;
    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId: fyId,
        number: 1,
        name: uniqueCode('P-S6-FX'),
        startDate: '2029-01-01',
        endDate: '2029-01-31'
      });
    expect(periodRes.status).toBe(201);

    const rate1 = await request(app)
      .post('/api/exchange-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currencyCode,
        rateDate: '2029-01-01T00:00:00.000Z',
        rate: 3.5,
        source: 'TEST'
      });
    expect(rate1.status).toBe(201);

    const rate2 = await request(app)
      .post('/api/exchange-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currencyCode,
        rateDate: '2029-01-31T00:00:00.000Z',
        rate: 3.8,
        source: 'TEST'
      });
    expect(rate2.status).toBe(201);

    const execute = await request(app)
      .post('/api/currency/revaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ asOfDate: '2029-01-31' });

    expect([200, 202]).toContain(execute.status);
    expect(execute.body.success).toBe(true);
    expect(execute.body.data.entryId).toBeTruthy();
    if (execute.status === 202) {
      expect(execute.body.data.summary.affectedAccounts).toBeGreaterThan(0);
    } else {
      expect(execute.body.data.duplicate).toBe(true);
    }

    const entryId = Number(execute.body.data.entryId);
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true }
    });

    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('POSTED');
    expect(entry!.reference).toBe('FXREV-2029-01-31');
    expect(entry!.lines.length).toBeGreaterThanOrEqual(2);

    const rerun = await request(app)
      .post('/api/currency/revaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ asOfDate: '2029-01-31' });

    expect(rerun.status).toBe(200);
    expect(rerun.body.success).toBe(true);
    expect(rerun.body.data.duplicate).toBe(true);
    expect(rerun.body.data.entryId).toBe(entryId);
  });
});
