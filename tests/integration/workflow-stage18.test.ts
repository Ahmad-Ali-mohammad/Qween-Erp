import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

type PostingContext = {
  dateIso: string;
  fiscalYear: number;
  periodNumber: number;
  periodId?: number;
  fiscalYearId?: number;
};

describe('Stage 18 deep CRUD coverage (Accounting advanced + Fixed Assets)', () => {
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

    const futureYear = 2200 + Number(String(Date.now()).slice(-3));
    const fy = await request(app).post('/api/fiscal-years').set(auth()).send({
      name: `FY-ST18-${futureYear}`,
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

  it('covers advanced accounting lifecycle (journals + ledger + reverse + year-end)', async () => {
    const ctx = await ensureOpenPostingContext();

    const form = await request(app).get('/api/quick-journal/form-data').set(auth());
    expect(form.status).toBe(200);
    const postingAccounts = Array.isArray(form.body?.data?.accounts) ? form.body.data.accounts : [];
    expect(postingAccounts.length).toBeGreaterThanOrEqual(2);
    const debitAccountId = Number(postingAccounts[0].id);
    const creditAccountId = Number(postingAccounts[1].id);

    let draftDeleteId = 0;
    let postedJournalId = 0;
    let reversedJournalId = 0;
    let closeYearId = 0;
    let nextYearId = 0;

    try {
      const draft = await request(app).post('/api/journals').set(auth()).send({
        date: ctx.dateIso,
        description: 'Stage18 accounting draft',
        lines: [
          { accountId: debitAccountId, debit: 150, credit: 0, description: 'dr' },
          { accountId: creditAccountId, debit: 0, credit: 150, description: 'cr' }
        ]
      });
      expect(draft.status).toBe(201);
      postedJournalId = Number(draft.body.data.id);

      const draftUpdate = await request(app).put(`/api/journals/${postedJournalId}`).set(auth()).send({
        description: 'Stage18 accounting draft updated',
        lines: [
          { accountId: debitAccountId, debit: 175, credit: 0, description: 'dr-updated' },
          { accountId: creditAccountId, debit: 0, credit: 175, description: 'cr-updated' }
        ]
      });
      expect(draftUpdate.status).toBe(200);

      const post = await request(app).post(`/api/journals/${postedJournalId}/post`).set(auth()).send({});
      expect(post.status).toBe(200);
      expect(String(post.body.data.status)).toBe('POSTED');

      const attach = await request(app)
        .post(`/api/journals/${postedJournalId}/attachments`)
        .set(auth())
        .send({ fileName: 'stage18-proof.pdf' });
      expect(attach.status).toBe(200);
      expect(Boolean(attach.body.data.stored)).toBe(true);

      const reverse = await request(app)
        .post(`/api/journals/${postedJournalId}/reverse`)
        .set(auth())
        .send({ reversalDate: ctx.dateIso, reason: 'stage18 reverse check' });
      expect(reverse.status).toBe(200);
      reversedJournalId = Number(reverse.body.data.id);
      expect(String(reverse.body.data.status)).toBe('POSTED');

      const transactions = await request(app).get(`/api/accounts/${debitAccountId}/transactions`).set(auth());
      expect(transactions.status).toBe(200);
      expect(Array.isArray(transactions.body.data)).toBe(true);

      const ledger = await request(app)
        .get(`/api/ledger/${debitAccountId}`)
        .set(auth())
        .query({ fromDate: ctx.dateIso, toDate: ctx.dateIso });
      expect(ledger.status).toBe(200);
      expect(Array.isArray(ledger.body.data)).toBe(true);

      const statement = await request(app)
        .get(`/api/account-statement/${debitAccountId}`)
        .set(auth())
        .query({ fromDate: ctx.dateIso, toDate: ctx.dateIso });
      expect(statement.status).toBe(200);
      expect(Number(statement.body.data.account.id)).toBe(debitAccountId);

      const draftToDelete = await request(app).post('/api/journals').set(auth()).send({
        date: ctx.dateIso,
        description: 'Stage18 draft delete',
        lines: [
          { accountId: debitAccountId, debit: 60, credit: 0, description: 'dr' },
          { accountId: creditAccountId, debit: 0, credit: 60, description: 'cr' }
        ]
      });
      expect(draftToDelete.status).toBe(201);
      draftDeleteId = Number(draftToDelete.body.data.id);

      const draftDelete = await request(app).delete(`/api/journals/${draftDeleteId}`).set(auth());
      expect(draftDelete.status).toBe(200);
      draftDeleteId = 0;

      const closeYear = 2600 + Number(String(Date.now()).slice(-3));
      const closeFy = await request(app).post('/api/fiscal-years').set(auth()).send({
        name: `FY-ST18-CLOSE-${closeYear}`,
        startDate: `${closeYear}-01-01T00:00:00.000Z`,
        endDate: `${closeYear}-12-31`,
        status: 'OPEN',
        isCurrent: false
      });
      expect(closeFy.status).toBe(201);
      closeYearId = Number(closeFy.body.data.id);

      const validate = await request(app).post(`/api/year-end-closing/${closeYearId}/validate`).set(auth()).send({});
      expect(validate.status).toBe(200);
      expect(Boolean(validate.body.data.canClose)).toBe(true);

      const execute = await request(app).post(`/api/year-end-closing/${closeYearId}/execute`).set(auth()).send({});
      expect(execute.status).toBe(202);
      expect(Boolean(execute.body.data.fiscalYear)).toBe(true);
      nextYearId = Number(execute.body.data.nextFiscalYear.id);
      expect(nextYearId).toBeGreaterThan(0);
    } finally {
      if (draftDeleteId) {
        await request(app).delete(`/api/journals/${draftDeleteId}`).set(auth());
      }
      if (nextYearId) {
        await prisma.accountingPeriod.deleteMany({ where: { fiscalYearId: nextYearId } });
        await prisma.fiscalYear.deleteMany({ where: { id: nextYearId } });
      }
      if (closeYearId) {
        await prisma.accountingPeriod.deleteMany({ where: { fiscalYearId: closeYearId } });
        await prisma.fiscalYear.deleteMany({ where: { id: closeYearId } });
      }
      if (ctx.periodId && ctx.fiscalYearId && ctx.fiscalYear > 2200) {
        await prisma.accountingPeriod.deleteMany({ where: { id: ctx.periodId } });
        await prisma.fiscalYear.deleteMany({ where: { id: ctx.fiscalYearId } });
      }
      void postedJournalId;
      void reversedJournalId;
    }
  });

  it('covers fixed assets lifecycle (categories/assets/depreciation/disposal/reports)', async () => {
    const ctx = await ensureOpenPostingContext();
    const form = await request(app).get('/api/quick-journal/form-data').set(auth());
    expect(form.status).toBe(200);
    const postingAccounts = Array.isArray(form.body?.data?.accounts) ? form.body.data.accounts : [];
    expect(postingAccounts.length).toBeGreaterThanOrEqual(3);

    const glAssetId = Number(postingAccounts[0].id);
    const glAccumulatedId = Number(postingAccounts[1].id);
    const glExpenseId = Number(postingAccounts[2].id);
    const proceedsAccountId = Number(postingAccounts[0].id);

    const categoryCode = uniqueCode('AC18').toUpperCase();
    const assetCode = uniqueCode('AST18').toUpperCase();

    let categoryId = 0;
    let assetId = 0;

    try {
      const categoryCreate = await request(app).post('/api/asset-categories').set(auth()).send({
        code: categoryCode,
        nameAr: 'تصنيف أصول مرحلة 18',
        usefulLifeMonths: 24,
        depreciationMethod: 'StraightLine',
        glAssetId,
        glAccumulatedId,
        glExpenseId,
        isActive: true
      });
      expect(categoryCreate.status).toBe(201);
      categoryId = Number(categoryCreate.body.data.id);

      const categoryGet = await request(app).get(`/api/asset-categories/${categoryId}`).set(auth());
      expect(categoryGet.status).toBe(200);

      const categoryPut = await request(app).put(`/api/asset-categories/${categoryId}`).set(auth()).send({
        nameAr: 'تصنيف أصول مرحلة 18 - محدث'
      });
      expect(categoryPut.status).toBe(200);

      const assetCreate = await request(app).post('/api/assets').set(auth()).send({
        code: assetCode,
        nameAr: 'أصل مرحلة 18',
        categoryId,
        purchaseDate: ctx.dateIso,
        purchaseCost: 1200,
        usefulLifeMonths: 24,
        salvageValue: 0,
        location: 'Riyadh'
      });
      expect(assetCreate.status).toBe(201);
      assetId = Number(assetCreate.body.data.id);

      const assetGet = await request(app).get(`/api/assets/${assetId}`).set(auth());
      expect(assetGet.status).toBe(200);

      const assetPut = await request(app).put(`/api/assets/${assetId}`).set(auth()).send({
        notes: 'Stage18 asset updated'
      });
      expect(assetPut.status).toBe(200);

      const depreciationRun = await request(app).post('/api/depreciation/run').set(auth()).send({
        fiscalYear: ctx.fiscalYear,
        period: ctx.periodNumber,
        description: 'Stage18 depreciation run'
      });
      expect(depreciationRun.status).toBe(200);

      const assetDep = await request(app).get(`/api/assets/${assetId}/depreciation`).set(auth());
      expect(assetDep.status).toBe(200);
      expect(Array.isArray(assetDep.body.data)).toBe(true);

      const schedules = await request(app).get('/api/depreciation-schedules').set(auth()).query({ assetId });
      expect(schedules.status).toBe(200);
      expect(Array.isArray(schedules.body.data)).toBe(true);

      const dispose = await request(app).post(`/api/assets/${assetId}/dispose`).set(auth()).send({
        disposedAt: ctx.dateIso,
        salePrice: 300,
        reason: 'Stage18 disposal',
        proceedsAccountId
      });
      expect(dispose.status).toBe(200);
      expect(['SOLD', 'SCRAPPED']).toContain(String(dispose.body.data.status));

      const fixedAssetsReport = await request(app).get('/api/reports/fixed-assets').set(auth());
      expect(fixedAssetsReport.status).toBe(200);
      expect(fixedAssetsReport.body).toHaveProperty('data.summary');

      const depreciationReport = await request(app).get('/api/reports/depreciation').set(auth());
      expect(depreciationReport.status).toBe(200);
      expect(Array.isArray(depreciationReport.body.data)).toBe(true);
    } finally {
      if (assetId) {
        await prisma.depreciationSchedule.deleteMany({ where: { assetId } });
        await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
      }
      if (categoryId) {
        await prisma.assetCategory.deleteMany({ where: { id: categoryId } });
      }
      if (ctx.periodId && ctx.fiscalYearId && ctx.fiscalYear > 2200) {
        await prisma.accountingPeriod.deleteMany({ where: { id: ctx.periodId } });
        await prisma.fiscalYear.deleteMany({ where: { id: ctx.fiscalYearId } });
      }
    }
  });
});
