import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 5 workflow coverage (Inventory Receive + Year Close)', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  async function pickUnusedYear(startYear: number): Promise<number> {
    let year = startYear;
    // Keep advancing until we find a year with no pre-existing accounting periods.
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

  it('receives purchase invoice into inventory with stock updates', async () => {
    const purchaseYear = await pickUnusedYear(2300);

    const purchaseFiscalYear = await prisma.fiscalYear.create({
      data: {
        name: uniqueCode('FY5P'),
        startDate: new Date(`${purchaseYear}-01-01T00:00:00.000Z`),
        endDate: new Date(`${purchaseYear}-12-31T23:59:59.999Z`),
        status: 'OPEN',
        isCurrent: false
      }
    });
    await prisma.accountingPeriod.create({
      data: {
        fiscalYearId: purchaseFiscalYear.id,
        number: 1,
        name: 'P01',
        startDate: new Date(`${purchaseYear}-01-01T00:00:00.000Z`),
        endDate: new Date(`${purchaseYear}-12-31T23:59:59.999Z`),
        status: 'OPEN',
        canPost: true
      }
    });

    const supplierRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: uniqueCode('SUP5'), nameAr: 'Stage5 Supplier' });
    expect(supplierRes.status).toBe(200);
    const supplierId = Number(supplierRes.body.data.id);
    expect(supplierId).toBeGreaterThan(0);

    const warehouse = await prisma.warehouse.create({
      data: {
        code: uniqueCode('WH5'),
        nameAr: 'Stage5 Warehouse'
      }
    });
    const warehouseId = Number(warehouse.id);
    expect(warehouseId).toBeGreaterThan(0);

    const itemCode = uniqueCode('ITM5');
    const productRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: itemCode, nameAr: 'Stage5 Stock Item', purchasePrice: 25 });
    expect(productRes.status).toBe(201);
    const itemId = Number(productRes.body.data.id);
    expect(itemId).toBeGreaterThan(0);

    const invoiceRes = await request(app)
      .post('/api/purchase-invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        date: `${purchaseYear}-01-15`,
        lines: [{ itemId, description: 'Received Item', quantity: 4, unitPrice: 25, discount: 0, taxRate: 0 }]
      });
    expect(invoiceRes.status).toBe(201);
    const invoiceId = Number(invoiceRes.body.data.id);
    expect(invoiceId).toBeGreaterThan(0);

    const approveRes = await request(app).post(`/api/purchase-invoices/${invoiceId}/approve`).set('Authorization', `Bearer ${token}`);
    expect(approveRes.status).toBe(200);

    const receiveRes = await request(app)
      .post(`/api/purchase-invoices/${invoiceId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, date: `${purchaseYear}-01-16` });
    expect(receiveRes.status).toBe(202);
    expect(receiveRes.body.success).toBe(true);
    expect(receiveRes.body.data.received).toBe(true);
    expect(Number(receiveRes.body.data.stockMovements)).toBe(1);

    const stockMovements = await prisma.stockMovement.findMany({
      where: { itemId, warehouseId, type: 'PURCHASE_RECEIPT' },
      orderBy: { id: 'desc' },
      take: 1
    });
    expect(stockMovements.length).toBeGreaterThan(0);
    expect(String(stockMovements[0].type)).toBe('PURCHASE_RECEIPT');

    const stockBalance = await prisma.stockBalance.findFirst({ where: { itemId, warehouseId, locationId: null } });
    expect(stockBalance).toBeTruthy();
    expect(Number(stockBalance!.quantity)).toBe(4);

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    expect(item).toBeTruthy();
    expect(Number(item!.onHandQty)).toBe(4);
    expect(Number(item!.inventoryValue)).toBe(100);

    const receiveAgain = await request(app)
      .post(`/api/purchase-invoices/${invoiceId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, date: `${purchaseYear}-01-16` });
    expect(receiveAgain.status).toBe(202);
    expect(Boolean(receiveAgain.body.data.duplicate)).toBe(true);
  });

  it('executes year-end closing with closing and opening journal entries', async () => {
    const closeYear = await pickUnusedYear(2400);

    const cash = await prisma.account.findUnique({ where: { code: '1100' } });
    const revenue = await prisma.account.findUnique({ where: { code: '4100' } });
    const equity = await prisma.account.findUnique({ where: { code: '3100' } });
    expect(cash).toBeTruthy();
    expect(revenue).toBeTruthy();
    expect(equity).toBeTruthy();

    const fiscalYearRes = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY5'),
        startDate: `${closeYear}-01-01`,
        endDate: `${closeYear}-12-31`,
        status: 'OPEN'
      });
    expect(fiscalYearRes.status).toBe(201);
    const fiscalYearId = Number(fiscalYearRes.body.data.id);
    expect(fiscalYearId).toBeGreaterThan(0);

    const periodRes = await request(app)
      .post('/api/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fiscalYearId,
        number: 1,
        name: 'Jan',
        startDate: `${closeYear}-01-01`,
        endDate: `${closeYear}-01-31`,
        status: 'OPEN',
        canPost: true
      });
    expect(periodRes.status).toBe(201);
    const periodId = Number(periodRes.body.data.id);
    expect(periodId).toBeGreaterThan(0);

    const quickJournal = await request(app)
      .post('/api/quick-journal')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: `${closeYear}-01-15`,
        description: 'Stage5 Year Close Revenue',
        postNow: true,
        lines: [
          { accountId: cash!.id, debit: 500, credit: 0, description: 'Cash inflow' },
          { accountId: revenue!.id, debit: 0, credit: 500, description: 'Revenue' }
        ]
      });
    expect(quickJournal.status).toBe(201);
    expect(Boolean(quickJournal.body.data.posted)).toBe(true);

    const closePeriodRes = await request(app).post(`/api/periods/${periodId}/close`).set('Authorization', `Bearer ${token}`).send({});
    expect(closePeriodRes.status).toBe(200);

    const validateRes = await request(app)
      .post(`/api/year-end-closing/${fiscalYearId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(validateRes.status).toBe(200);
    expect(Boolean(validateRes.body.data.canClose)).toBe(true);

    const executeRes = await request(app)
      .post(`/api/year-end-closing/${fiscalYearId}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(executeRes.status).toBe(202);
    expect(executeRes.body.success).toBe(true);
    expect(String(executeRes.body.data.fiscalYear.status)).toBe('CLOSED');
    expect(Boolean(executeRes.body.data.closingEntriesCreated)).toBe(true);
    expect(Boolean(executeRes.body.data.openingBalancesTransferred)).toBe(true);
    expect(Number(executeRes.body.data.closingEntryId)).toBeGreaterThan(0);
    expect(Number(executeRes.body.data.openingEntryId)).toBeGreaterThan(0);

    const closingEntryId = Number(executeRes.body.data.closingEntryId);
    const openingEntryId = Number(executeRes.body.data.openingEntryId);

    const closingEntry = await prisma.journalEntry.findUnique({
      where: { id: closingEntryId },
      include: { lines: true }
    });
    expect(closingEntry).toBeTruthy();
    expect(String(closingEntry!.status)).toBe('POSTED');
    expect(Math.abs(Number(closingEntry!.totalDebit) - Number(closingEntry!.totalCredit))).toBeLessThan(0.001);
    expect(closingEntry!.lines.some((l) => l.accountId === revenue!.id)).toBe(true);
    expect(closingEntry!.lines.some((l) => l.accountId === equity!.id)).toBe(true);

    const openingEntry = await prisma.journalEntry.findUnique({
      where: { id: openingEntryId },
      include: { lines: true }
    });
    expect(openingEntry).toBeTruthy();
    expect(String(openingEntry!.status)).toBe('POSTED');
    expect(Math.abs(Number(openingEntry!.totalDebit) - Number(openingEntry!.totalCredit))).toBeLessThan(0.001);
    expect(openingEntry!.lines.some((l) => l.accountId === cash!.id)).toBe(true);
    expect(openingEntry!.lines.some((l) => l.accountId === equity!.id)).toBe(true);
  });
});
