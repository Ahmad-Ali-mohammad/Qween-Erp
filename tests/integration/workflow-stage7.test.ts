import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 7 depreciation workflow coverage', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('runs depreciation with posted journal entry and idempotency', async () => {
    const expenseAccount = await prisma.account.findFirst({ where: { code: '5100' }, select: { id: true } });
    const accumulatedAccount = await prisma.account.findFirst({ where: { code: '2100' }, select: { id: true } });
    expect(expenseAccount).toBeTruthy();
    expect(accumulatedAccount).toBeTruthy();

    const categoryRes = await request(app)
      .post('/api/assets/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('ACAT7'),
        nameAr: 'فئة أصول مرحلة 7',
        usefulLifeMonths: 12,
        depreciationMethod: 'StraightLine',
        salvagePercent: 0,
        glExpenseId: expenseAccount!.id,
        glAccumulatedId: accumulatedAccount!.id
      });
    expect(categoryRes.status).toBe(201);
    const categoryId = Number(categoryRes.body.data.id);

    const assetRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('AST7'),
        nameAr: 'أصل مرحلة 7',
        categoryId,
        purchaseDate: '2035-01-01T00:00:00.000Z',
        purchaseCost: 12000,
        usefulLifeMonths: 12,
        salvageValue: 0
      });
    expect(assetRes.status).toBe(201);
    const assetId = Number(assetRes.body.data.id);

    const fiscalYear = 3000 + Math.floor(Math.random() * 400);
    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S7'),
        startDate: `${fiscalYear}-01-01`,
        endDate: `${fiscalYear}-12-31`
      });
    expect(fyRes.status).toBe(201);
    const fiscalYearId = Number(fyRes.body.data.id);

    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId,
        number: 1,
        name: uniqueCode('P-S7'),
        startDate: `${fiscalYear}-01-01`,
        endDate: `${fiscalYear}-01-31`
      });
    expect(periodRes.status).toBe(201);

    const runRes = await request(app)
      .post('/api/depreciation/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ fiscalYear, period: 1 });
    expect(runRes.status).toBe(200);
    expect(runRes.body.success).toBe(true);
    expect(runRes.body.data.duplicate).toBe(false);
    expect(runRes.body.data.journalEntryId).toBeTruthy();
    expect(runRes.body.data.summary.createdSchedules).toBeGreaterThan(0);

    const schedule = await prisma.depreciationSchedule.findUnique({
      where: {
        assetId_fiscalYear_period: {
          assetId,
          fiscalYear,
          period: 1
        }
      }
    });
    expect(schedule).toBeTruthy();
    expect(schedule!.status).toBe('POSTED');
    expect(Number(schedule!.expense)).toBeGreaterThan(0);

    const reference = `DEP-${fiscalYear}-01`;
    const entry = await prisma.journalEntry.findFirst({
      where: { reference },
      include: { lines: true },
      orderBy: { id: 'desc' }
    });
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('POSTED');
    expect(entry!.source).toBe('ASSETS');
    expect(Number(entry!.totalDebit)).toBeCloseTo(Number(entry!.totalCredit), 2);
    expect(entry!.lines.length).toBeGreaterThanOrEqual(2);

    const rerun = await request(app)
      .post('/api/depreciation/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ fiscalYear, period: 1 });
    expect(rerun.status).toBe(200);
    expect(rerun.body.success).toBe(true);
    expect(rerun.body.data.duplicate).toBe(true);
    expect(Number(rerun.body.data.journalEntryId)).toBe(Number(entry!.id));
  });
});

