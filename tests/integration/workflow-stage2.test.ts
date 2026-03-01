import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 2 workflow coverage', () => {
  let token = '';
  let cashAccountId = 0;
  let revenueAccountId = 0;
  let expenseAccountId = 0;

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();

    const accounts = await prisma.account.findMany({
      where: { code: { in: ['1100', '4100', '5100'] } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    cashAccountId = Number(byCode.get('1100') ?? 0);
    revenueAccountId = Number(byCode.get('4100') ?? 0);
    expenseAccountId = Number(byCode.get('5100') ?? 0);
  });

  it('runs accounting workflow: quick journal -> reverse -> statement', async () => {
    expect(cashAccountId).toBeGreaterThan(0);
    expect(revenueAccountId).toBeGreaterThan(0);

    const amount = 250;
    const today = new Date().toISOString().slice(0, 10);

    const createJournal = await request(app)
      .post('/api/quick-journal')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: today,
        description: 'Stage2 quick journal',
        postNow: true,
        lines: [
          { accountId: cashAccountId, debit: amount, credit: 0, description: 'cash increase' },
          { accountId: revenueAccountId, debit: 0, credit: amount, description: 'revenue recognition' }
        ]
      });
    expect(createJournal.status).toBe(201);
    expect(createJournal.body.success).toBe(true);
    expect(createJournal.body.data.posted).toBe(true);
    const entryId = Number(createJournal.body.data.journal.id);
    expect(entryId).toBeGreaterThan(0);

    const reverse = await request(app)
      .post(`/api/journals/${entryId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Stage2 reverse check' });
    expect(reverse.status).toBe(200);
    expect(reverse.body.success).toBe(true);
    expect(reverse.body.data.status).toBe('POSTED');

    const statement = await request(app)
      .get(`/api/account-statement/${cashAccountId}`)
      .set('Authorization', `Bearer ${token}`)
      .query({ fromDate: today, toDate: today });
    expect(statement.status).toBe(200);
    expect(statement.body.success).toBe(true);
    expect(Array.isArray(statement.body.data.rows)).toBe(true);
  });

  it('runs sales workflow: quick invoice -> receipt complete -> customer statement/search', async () => {
    const customerCreate = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('CUST2'),
        nameAr: 'Stage2 Customer'
      });
    expect(customerCreate.status).toBe(200);
    const customerId = Number(customerCreate.body.data.id);
    expect(customerId).toBeGreaterThan(0);

    const quickInvoice = await request(app)
      .post('/api/quick-invoice')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        date: new Date().toISOString().slice(0, 10),
        lines: [
          {
            description: 'Stage2 service line',
            quantity: 1,
            unitPrice: 100,
            discount: 0,
            taxRate: 15
          }
        ]
      });
    expect(quickInvoice.status).toBe(201);
    expect(quickInvoice.body.success).toBe(true);
    expect(quickInvoice.body.data.issued).toBe(true);
    const salesInvoiceId = Number(quickInvoice.body.data.invoice.id);
    const total = Number(quickInvoice.body.data.invoice.total);
    expect(salesInvoiceId).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);

    const receiptCreate = await request(app)
      .post('/api/payment-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        method: 'CASH',
        date: new Date().toISOString().slice(0, 10),
        amount: total
      });
    expect(receiptCreate.status).toBe(201);
    const receiptId = Number(receiptCreate.body.data.id);
    expect(receiptId).toBeGreaterThan(0);

    const receiptComplete = await request(app)
      .post(`/api/payment-receipts/${receiptId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId: salesInvoiceId, amount: total }]
      });
    expect(receiptComplete.status).toBe(200);
    expect(receiptComplete.body.success).toBe(true);
    expect(receiptComplete.body.data.status).toBe('COMPLETED');

    const invoiceAfter = await request(app).get(`/api/sales-invoices/${salesInvoiceId}`).set('Authorization', `Bearer ${token}`);
    expect(invoiceAfter.status).toBe(200);
    expect(invoiceAfter.body.success).toBe(true);
    expect(['PAID', 'PARTIAL']).toContain(String(invoiceAfter.body.data.status));

    const quickStatement = await request(app)
      .get('/api/quick-statement')
      .set('Authorization', `Bearer ${token}`)
      .query({ entityType: 'CUSTOMER', entityId: customerId });
    expect(quickStatement.status).toBe(200);
    expect(quickStatement.body.success).toBe(true);
    expect(quickStatement.body.data).toHaveProperty('summary');

    const search = await request(app).get('/api/search').set('Authorization', `Bearer ${token}`).query({ q: 'Stage2 Customer' });
    expect(search.status).toBe(200);
    expect(search.body.success).toBe(true);
    expect(Array.isArray(search.body.data.customers)).toBe(true);
  });

  it('runs purchasing workflow: purchase invoice -> approve -> payment voucher', async () => {
    const supplierCreate = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('SUP2'),
        nameAr: 'Stage2 Supplier'
      });
    expect(supplierCreate.status).toBe(200);
    const supplierId = Number(supplierCreate.body.data.id);
    expect(supplierId).toBeGreaterThan(0);

    const purchaseInvoice = await request(app)
      .post('/api/purchase-invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        date: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'Stage2 purchase item', quantity: 2, unitPrice: 50, discount: 0, taxRate: 15 }]
      });
    expect(purchaseInvoice.status).toBe(201);
    const purchaseInvoiceId = Number(purchaseInvoice.body.data.id);
    expect(purchaseInvoiceId).toBeGreaterThan(0);

    const approve = await request(app).post(`/api/purchase-invoices/${purchaseInvoiceId}/approve`).set('Authorization', `Bearer ${token}`);
    expect(approve.status).toBe(200);
    expect(approve.body.success).toBe(true);
    expect(approve.body.data.status).toBe('ISSUED');

    const receive = await request(app).post(`/api/purchase-invoices/${purchaseInvoiceId}/receive`).set('Authorization', `Bearer ${token}`).send({});
    expect(receive.status).toBe(202);

    const purchaseDetails = await request(app).get(`/api/purchase-invoices/${purchaseInvoiceId}`).set('Authorization', `Bearer ${token}`);
    expect(purchaseDetails.status).toBe(200);
    const total = Number(purchaseDetails.body.data.total);
    expect(total).toBeGreaterThan(0);

    const voucher = await request(app)
      .post('/api/payment-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        method: 'CASH',
        date: new Date().toISOString().slice(0, 10),
        amount: total
      });
    expect(voucher.status).toBe(201);
    const voucherId = Number(voucher.body.data.id);
    expect(voucherId).toBeGreaterThan(0);

    const voucherComplete = await request(app)
      .post(`/api/payment-vouchers/${voucherId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId: purchaseInvoiceId, amount: total }]
      });
    expect(voucherComplete.status).toBe(200);
    expect(voucherComplete.body.success).toBe(true);
    expect(voucherComplete.body.data.status).toBe('COMPLETED');

    const supplierStatement = await request(app).get(`/api/suppliers/${supplierId}/statement`).set('Authorization', `Bearer ${token}`);
    expect(supplierStatement.status).toBe(200);
    expect(supplierStatement.body.success).toBe(true);
  });

  it('enforces allocation guard rails (same entity + not over outstanding)', async () => {
    const c1 = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: uniqueCode('CGA1'), nameAr: 'Guard Customer 1' });
    const c2 = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: uniqueCode('CGA2'), nameAr: 'Guard Customer 2' });
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);

    const customer1Id = Number(c1.body.data.id);
    const customer2Id = Number(c2.body.data.id);
    expect(customer1Id).toBeGreaterThan(0);
    expect(customer2Id).toBeGreaterThan(0);

    const inv1 = await request(app)
      .post('/api/sales-invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer1Id,
        date: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'Guard Invoice 1', quantity: 1, unitPrice: 100, discount: 0, taxRate: 15 }]
      });
    const inv2 = await request(app)
      .post('/api/sales-invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer2Id,
        date: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'Guard Invoice 2', quantity: 1, unitPrice: 100, discount: 0, taxRate: 15 }]
      });
    expect(inv1.status).toBe(201);
    expect(inv2.status).toBe(201);

    const invoice1Id = Number(inv1.body.data.id);
    const invoice2Id = Number(inv2.body.data.id);
    const invoice1Outstanding = Number(inv1.body.data.outstanding);
    expect(invoice1Outstanding).toBeGreaterThan(0);

    const sameAmountReceipt = await request(app)
      .post('/api/payment-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer1Id,
        method: 'CASH',
        date: new Date().toISOString().slice(0, 10),
        amount: invoice1Outstanding
      });
    expect(sameAmountReceipt.status).toBe(201);
    const sameAmountReceiptId = Number(sameAmountReceipt.body.data.id);

    const wrongEntityAllocation = await request(app)
      .post(`/api/payment-receipts/${sameAmountReceiptId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId: invoice2Id, amount: invoice1Outstanding }]
      });
    expect(wrongEntityAllocation.status).toBe(400);
    expect(wrongEntityAllocation.body.success).toBe(false);

    const overAmount = invoice1Outstanding + 50;
    const overReceipt = await request(app)
      .post('/api/payment-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer1Id,
        method: 'CASH',
        date: new Date().toISOString().slice(0, 10),
        amount: overAmount
      });
    expect(overReceipt.status).toBe(201);
    const overReceiptId = Number(overReceipt.body.data.id);

    const overAllocate = await request(app)
      .post(`/api/payment-receipts/${overReceiptId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId: invoice1Id, amount: overAmount }]
      });
    expect(overAllocate.status).toBe(400);
    expect(overAllocate.body.success).toBe(false);
  });

  it('runs admin workflow: budget/tax/mfa/internal-control/year-close', async () => {
    const currentYear = new Date().getUTCFullYear();

    const budget = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: uniqueCode('BGT2'),
        nameAr: 'Stage2 Budget',
        fiscalYear: currentYear,
        controlLevel: 'WARNING'
      });
    expect(budget.status).toBe(201);
    const budgetId = Number(budget.body.data.id);
    expect(budgetId).toBeGreaterThan(0);

    const line = await request(app)
      .post('/api/budget-lines')
      .set('Authorization', `Bearer ${token}`)
      .send({
        budgetId,
        accountId: expenseAccountId,
        period: 1,
        amount: 1000
      });
    expect(line.status).toBe(201);

    const approveBudget = await request(app).post(`/api/budgets/${budgetId}/approve`).set('Authorization', `Bearer ${token}`);
    expect(approveBudget.status).toBe(200);
    expect(approveBudget.body.data.status).toBe('ACTIVE');

    const budgetReport = await request(app).get(`/api/reports/budget-variance/${budgetId}`).set('Authorization', `Bearer ${token}`);
    expect(budgetReport.status).toBe(200);
    expect(budgetReport.body.success).toBe(true);

    const declaration = await request(app)
      .post('/api/tax-declarations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        periodStart: `${currentYear}-01-01`,
        periodEnd: `${currentYear}-01-31`,
        type: 'VAT',
        totalSales: 1000,
        totalPurchases: 500,
        outputTax: 150,
        inputTax: 75,
        netPayable: 75
      });
    expect(declaration.status).toBe(201);
    const declarationId = Number(declaration.body.data.id);
    expect(declarationId).toBeGreaterThan(0);

    const submitDecl = await request(app).post(`/api/tax-declarations/${declarationId}/submit`).set('Authorization', `Bearer ${token}`).send({});
    expect(submitDecl.status).toBe(200);
    expect(submitDecl.body.data.status).toBe('FILED');

    const payDecl = await request(app).post(`/api/tax-declarations/${declarationId}/pay`).set('Authorization', `Bearer ${token}`).send({});
    expect(payDecl.status).toBe(200);
    expect(payDecl.body.data.status).toBe('PAID');

    const enableMfa = await request(app).post('/api/profile/mfa/enable').set('Authorization', `Bearer ${token}`).send({ method: 'APP' });
    expect(enableMfa.status).toBe(200);
    expect(enableMfa.body.success).toBe(true);

    const verifyMfa = await request(app).post('/api/profile/mfa/verify').set('Authorization', `Bearer ${token}`).send({ token: '123456' });
    expect(verifyMfa.status).toBe(200);
    expect(verifyMfa.body.success).toBe(true);

    await prisma.integrationSetting.create({
      data: {
        key: `internal-control:alert:${Date.now()}`,
        provider: 'SYSTEM',
        isEnabled: true,
        status: 'OPEN',
        settings: { type: 'workflow-check', severity: 'HIGH' }
      }
    });

    const alerts = await request(app).get('/api/internal-control/alerts').set('Authorization', `Bearer ${token}`);
    expect(alerts.status).toBe(200);
    expect(alerts.body.success).toBe(true);
    expect(Array.isArray(alerts.body.data)).toBe(true);
    const alertId = Number(alerts.body.data[0]?.id ?? 0);
    expect(alertId).toBeGreaterThan(0);

    const resolve = await request(app).post(`/api/internal-control/resolve/${alertId}`).set('Authorization', `Bearer ${token}`).send({});
    expect(resolve.status).toBe(200);
    expect(resolve.body.success).toBe(true);

    const fy = await request(app)
      .post('/api/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniqueCode('FY2'),
        startDate: '2099-01-01',
        endDate: '2099-12-31',
        status: 'OPEN'
      });
    expect(fy.status).toBe(201);
    const fiscalYearId = Number(fy.body.data.id);
    expect(fiscalYearId).toBeGreaterThan(0);

    const validateClose = await request(app).post(`/api/year-end-closing/${fiscalYearId}/validate`).set('Authorization', `Bearer ${token}`).send({});
    expect(validateClose.status).toBe(200);
    expect(validateClose.body.success).toBe(true);
    expect(validateClose.body.data.canClose).toBe(true);

    const executeClose = await request(app).post(`/api/year-end-closing/${fiscalYearId}/execute`).set('Authorization', `Bearer ${token}`).send({});
    expect(executeClose.status).toBe(202);
    expect(executeClose.body.success).toBe(true);
    expect(executeClose.body.data.fiscalYear.status).toBe('CLOSED');
  });
});
