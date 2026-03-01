import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 8 asset disposal workflow coverage', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('disposes asset with posted accounting entry and prevents duplicate disposal', async () => {
    const assetAccount = await prisma.account.findFirst({ where: { code: '1100' }, select: { id: true } });
    const accumulatedAccount = await prisma.account.findFirst({ where: { code: '2100' }, select: { id: true } });
    const cashAccount = await prisma.account.findFirst({ where: { code: '1100' }, select: { id: true } });
    expect(assetAccount).toBeTruthy();
    expect(accumulatedAccount).toBeTruthy();
    expect(cashAccount).toBeTruthy();

    const categoryRes = await request(app)
      .post('/api/assets/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('ACAT8'),
        nameAr: 'فئة أصل مرحلة 8',
        usefulLifeMonths: 60,
        glAssetId: assetAccount!.id,
        glAccumulatedId: accumulatedAccount!.id
      });
    expect(categoryRes.status).toBe(201);
    const categoryId = Number(categoryRes.body.data.id);

    const assetRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('AST8'),
        nameAr: 'أصل مرحلة 8',
        categoryId,
        purchaseDate: '2040-01-01T00:00:00.000Z',
        purchaseCost: 10000,
        usefulLifeMonths: 60,
        salvageValue: 0
      });
    expect(assetRes.status).toBe(201);
    const assetId = Number(assetRes.body.data.id);

    await prisma.fixedAsset.update({
      where: { id: assetId },
      data: {
        accumulatedDepreciation: 3000,
        netBookValue: 7000
      }
    });

    const fiscalYear = 3400 + Math.floor(Math.random() * 300);
    const fyRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY-S8'),
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
        name: uniqueCode('P-S8'),
        startDate: `${fiscalYear}-01-01`,
        endDate: `${fiscalYear}-01-31`
      });
    expect(periodRes.status).toBe(201);

    const disposeDate = `${fiscalYear}-01-20T00:00:00.000Z`;
    const disposeRes = await request(app)
      .post(`/api/assets/${assetId}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        salePrice: 8000,
        disposedAt: disposeDate,
        reason: 'اختبار صرف أصل',
        proceedsAccountId: cashAccount!.id
      });

    expect(disposeRes.status).toBe(200);
    expect(disposeRes.body.success).toBe(true);
    expect(disposeRes.body.data.asset.status).toBe('SOLD');
    expect(disposeRes.body.data.journalEntryId).toBeTruthy();
    expect(Number(disposeRes.body.data.gainLoss)).toBeCloseTo(1000, 2);

    const entryId = Number(disposeRes.body.data.journalEntryId);
    const entry = await prisma.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('POSTED');
    expect(entry!.source).toBe('ASSETS');
    expect(entry!.reference).toBe(`ASSET-DISPOSE-${assetId}`);
    expect(Number(entry!.totalDebit)).toBeCloseTo(Number(entry!.totalCredit), 2);
    expect(entry!.lines.length).toBeGreaterThanOrEqual(3);

    const updatedAsset = await prisma.fixedAsset.findUnique({ where: { id: assetId } });
    expect(updatedAsset).toBeTruthy();
    expect(updatedAsset!.isDepreciating).toBe(false);
    expect(Number(updatedAsset!.netBookValue)).toBe(0);

    const disposeAgain = await request(app)
      .post(`/api/assets/${assetId}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        salePrice: 5000,
        disposedAt: disposeDate
      });
    expect(disposeAgain.status).toBe(400);
  });
});

