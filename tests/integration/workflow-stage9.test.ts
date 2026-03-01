import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 9 tax declaration workflow coverage', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  async function pickUnusedYear(startYear: number): Promise<number> {
    let year = startYear;
    while (true) {
      const from = new Date(`${year}-01-01T00:00:00.000Z`);
      const to = new Date(`${year}-12-31T23:59:59.999Z`);
      const overlapping = await prisma.accountingPeriod.count({
        where: { startDate: { lte: to }, endDate: { gte: from } }
      });
      if (overlapping === 0) return year;
      year += 1;
    }
  }

  it('enforces declaration lifecycle and posts payment journal', async () => {
    const cashAccount = await prisma.account.findFirst({ where: { code: '1100' }, select: { id: true } });
    expect(cashAccount).toBeTruthy();

    const year = await pickUnusedYear(3600);

    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S9'),
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`
      });
    expect(fyRes.status).toBe(201);
    const fiscalYearId = Number(fyRes.body.data.id);
    expect(fiscalYearId).toBeGreaterThan(0);

    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId,
        number: 1,
        name: uniqueCode('P-S9'),
        startDate: `${year}-01-01`,
        endDate: `${year}-01-31`
      });
    expect(periodRes.status).toBe(201);

    const create = await request(app)
      .post('/api/tax-declarations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-01-31`,
        totalSales: 1000,
        totalPurchases: 0,
        outputTax: 150,
        inputTax: 0,
        netPayable: 150
      });
    expect(create.status).toBe(201);
    const declarationId = Number(create.body.data.id);
    expect(declarationId).toBeGreaterThan(0);

    const payBeforeSubmit = await request(app)
      .post(`/api/tax-declarations/${declarationId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidDate: `${year}-01-20T00:00:00.000Z`,
        cashAccountId: cashAccount!.id
      });
    expect(payBeforeSubmit.status).toBe(400);

    const submit = await request(app)
      .post(`/api/tax-declarations/${declarationId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        filedDate: `${year}-01-15T00:00:00.000Z`,
        filedReference: `S9-FILED-${declarationId}`
      });
    expect(submit.status).toBe(200);
    expect(submit.body.success).toBe(true);
    expect(submit.body.data.duplicate).toBe(false);
    expect(submit.body.data.status).toBe('FILED');

    const submitAgain = await request(app)
      .post(`/api/tax-declarations/${declarationId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(submitAgain.status).toBe(200);
    expect(submitAgain.body.data.duplicate).toBe(true);

    const pay = await request(app)
      .post(`/api/tax-declarations/${declarationId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidDate: `${year}-01-20T00:00:00.000Z`,
        paidReference: `S9-PAID-${declarationId}`,
        cashAccountId: cashAccount!.id
      });
    expect(pay.status).toBe(200);
    expect(pay.body.success).toBe(true);
    expect(pay.body.data.duplicate).toBe(false);
    expect(pay.body.data.status).toBe('PAID');
    expect(Number(pay.body.data.journalEntryId)).toBeGreaterThan(0);

    const entryId = Number(pay.body.data.journalEntryId);
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true }
    });
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('POSTED');
    expect(entry!.reference).toBe(`TAX-DECL-PAY-${declarationId}`);
    expect(Number(entry!.totalDebit)).toBeCloseTo(Number(entry!.totalCredit), 2);
    expect(entry!.lines.length).toBe(2);
    expect(Number(entry!.totalDebit)).toBeCloseTo(150, 2);

    const payAgain = await request(app)
      .post(`/api/tax-declarations/${declarationId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(payAgain.status).toBe(200);
    expect(payAgain.body.data.duplicate).toBe(true);
    expect(Number(payAgain.body.data.journalEntryId)).toBe(entryId);
  });
});
