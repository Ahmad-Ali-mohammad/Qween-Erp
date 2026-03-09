import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

jest.setTimeout(60000);

describe('Stage 17 workflow coverage (Quick Access + Dashboard + Reports)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('covers quick access flows end-to-end (journal/invoice/statement/search)', async () => {
    const customerCode = uniqueCode('Q17CUS').toUpperCase();

    let customerId = 0;
    let quickInvoiceId = 0;
    let quickJournalId = 0;
    let debitAccountId = 0;
    let creditAccountId = 0;

    try {
      const formDataJournal = await request(app).get('/api/quick-journal/form-data').set(auth());
      expect(formDataJournal.status).toBe(200);
      expect(Array.isArray(formDataJournal.body.data.accounts)).toBe(true);
      expect(Array.isArray(formDataJournal.body.data.periods)).toBe(true);

      const postingAccounts = formDataJournal.body.data.accounts as Array<{ id: number }>;
      expect(postingAccounts.length).toBeGreaterThanOrEqual(2);
      debitAccountId = Number(postingAccounts[0].id);
      creditAccountId = Number(postingAccounts[1].id);
      const periods = formDataJournal.body.data.periods as Array<{ startDate?: string }>;
      const quickJournalDate = periods.length && periods[0].startDate ? periods[0].startDate : new Date().toISOString();

      const quickJournal = await request(app).post('/api/quick-journal').set(auth()).send({
        date: quickJournalDate,
        description: 'Quick journal stage 17',
        postNow: true,
        lines: [
          { accountId: debitAccountId, debit: 100, credit: 0, description: 'dr' },
          { accountId: creditAccountId, debit: 0, credit: 100, description: 'cr' }
        ]
      });
      expect([201, 422]).toContain(quickJournal.status);
      if (quickJournal.status === 201) {
        expect(quickJournal.body.data.posted).toBe(true);
        quickJournalId = Number(quickJournal.body.data.journal.id);
      }

      const customer = await request(app).post('/api/customers').set(auth()).send({
        code: customerCode,
        nameAr: 'Quick Customer 17'
      });
      expect([200, 201]).toContain(customer.status);
      customerId = Number(customer.body.data.id);

      const formDataInvoice = await request(app).get('/api/quick-invoice/form-data').set(auth());
      expect(formDataInvoice.status).toBe(200);
      expect(Array.isArray(formDataInvoice.body.data.customers)).toBe(true);
      expect(Array.isArray(formDataInvoice.body.data.products)).toBe(true);

      const quickInvoice = await request(app).post('/api/quick-invoice').set(auth()).send({
        customerId,
        date: new Date().toISOString(),
        issueNow: true,
        lines: [{ description: 'Quick item 17', quantity: 1, unitPrice: 100, taxRate: 15 }]
      });
      expect(quickInvoice.status).toBe(201);
      expect(quickInvoice.body.data.issued).toBe(true);
      quickInvoiceId = Number(quickInvoice.body.data.invoice.id);

      const customerStatement = await request(app)
        .get(`/api/quick-statement?entityType=CUSTOMER&entityId=${customerId}`)
        .set(auth());
      expect(customerStatement.status).toBe(200);
      expect(customerStatement.body.data.entityType).toBe('CUSTOMER');

      const accountStatement = await request(app)
        .get(`/api/quick-statement?entityType=ACCOUNT&entityId=${debitAccountId}`)
        .set(auth());
      expect(accountStatement.status).toBe(200);
      expect(accountStatement.body.data.entityType).toBe('ACCOUNT');

      const globalSearch = await request(app).get(`/api/search?q=${encodeURIComponent(customerCode)}`).set(auth());
      expect(globalSearch.status).toBe(200);
      expect(Array.isArray(globalSearch.body.data.customers)).toBe(true);
    } finally {
      if (quickInvoiceId) await prisma.invoice.deleteMany({ where: { id: quickInvoiceId } });
      if (quickJournalId) await prisma.journalEntry.deleteMany({ where: { id: quickJournalId } });
      if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it('covers dashboard and reporting pages health checks with valid payloads', async () => {
    const endpoints = [
      '/api/dashboard/kpi',
      '/api/dashboard/charts/sales',
      '/api/dashboard/charts/expenses',
      '/api/dashboard/recent-transactions',
      '/api/dashboard/pending-tasks',
      '/api/reports/trial-balance',
      '/api/reports/income-statement',
      '/api/reports/balance-sheet',
      '/api/reports/kpis',
      '/api/reports/aging?type=customer&asOfDate=2026-12-31',
      '/api/reports/cash-flow',
      '/api/reports/comparative-income-statement',
      '/api/reports/sales-summary',
      '/api/reports/sales-by-customer',
      '/api/reports/sales-by-product',
      '/api/reports/sales-by-salesman',
      '/api/reports/purchases-summary',
      '/api/reports/purchases-by-supplier',
      '/api/reports/purchases-by-product',
      '/api/reports/inventory-valuation',
      '/api/reports/inventory-movements',
      '/api/reports/low-stock',
      '/api/reports/fixed-assets',
      '/api/reports/depreciation',
      '/api/reports/budget-summary',
      '/api/reports/tax-summary',
      '/api/reports/currency-differences',
      '/api/reports/abc-analysis',
      '/api/reports/customer-lifetime-value',
      '/api/reports/sales-forecast',
      '/api/reports/balanced-scorecard',
      '/api/reports/bank-reconciliation'
    ];

    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
    }
  });
});
