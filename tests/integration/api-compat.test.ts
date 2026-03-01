import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('API compatibility endpoints', () => {
  let token = '';
  let customerId = 0;
  let salesInvoiceId = 0;
  let supplierId = 0;

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();

    const customer = await prisma.customer.create({
      data: {
        code: uniqueCode('CUST'),
        nameAr: 'عميل اختبار التوافق'
      }
    });
    customerId = customer.id;

    const supplier = await prisma.supplier.create({
      data: {
        code: uniqueCode('SUP'),
        nameAr: 'مورد اختبار التوافق'
      }
    });
    supplierId = supplier.id;
  });

  it('returns quick-journal form data', async () => {
    const res = await request(app).get('/api/quick-journal/form-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accounts');
    expect(res.body.data).toHaveProperty('periods');
  });

  it('returns dashboard kpi', async () => {
    const res = await request(app).get('/api/dashboard/kpi').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('pendingInvoices');
  });

  it('creates and reads sales-invoices alias endpoints', async () => {
    const createRes = await request(app)
      .post('/api/sales-invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        date: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'خدمة اختبار', quantity: 1, unitPrice: 100, discount: 0, taxRate: 15 }]
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    salesInvoiceId = Number(createRes.body.data.id);
    expect(salesInvoiceId).toBeGreaterThan(0);

    const getRes = await request(app).get(`/api/sales-invoices/${salesInvoiceId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.id).toBe(salesInvoiceId);

    const emailRes = await request(app)
      .post(`/api/sales-invoices/${salesInvoiceId}/email`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'customer@test.local' });
    expect(emailRes.status).toBe(202);
    expect(emailRes.body.success).toBe(true);
  });

  it('allocates payment receipt using alias endpoint', async () => {
    const createRes = await request(app)
      .post('/api/payment-receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'RECEIPT',
        method: 'CASH',
        date: new Date().toISOString().slice(0, 10),
        amount: 115,
        customerId
      });
    expect(createRes.status).toBe(201);
    const paymentId = Number(createRes.body.data.id);
    expect(paymentId).toBeGreaterThan(0);

    const allocateRes = await request(app)
      .post(`/api/payment-receipts/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId: salesInvoiceId, amount: 115 }]
      });
    expect(allocateRes.status).toBe(200);
    expect(allocateRes.body.success).toBe(true);
  });

  it('supports products alias endpoints', async () => {
    const code = uniqueCode('ITEM');
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code,
        nameAr: 'صنف اختبار توافق'
      });
    expect(createRes.status).toBe(201);
    const id = Number(createRes.body.data.id);
    expect(id).toBeGreaterThan(0);

    const stockRes = await request(app).get(`/api/products/${id}/stock`).set('Authorization', `Bearer ${token}`);
    expect(stockRes.status).toBe(200);
    expect(stockRes.body.success).toBe(true);
  });

  it('returns profile endpoint', async () => {
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('admin');
  });

  it('supports bank-account and reconciliation aliases', async () => {
    const bankCreate = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'بنك اختبار',
        accountNumber: uniqueCode('BANK'),
        bankName: 'Test Bank',
        accountType: 'Current'
      });
    expect(bankCreate.status).toBe(201);
    const bankId = Number(bankCreate.body.data.id);
    expect(bankId).toBeGreaterThan(0);

    const reconCreate = await request(app)
      .post('/api/bank-reconciliations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bankId, statementBalance: 0 });
    expect(reconCreate.status).toBe(201);
    const reconId = Number(reconCreate.body.data.id);
    expect(reconId).toBeGreaterThan(0);

    const bankTxn = await request(app)
      .post('/api/bank-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankId,
        date: new Date().toISOString().slice(0, 10),
        description: 'Compat reconciliation transaction',
        debit: 0,
        credit: 50
      });
    expect(bankTxn.status).toBe(201);
    const transactionId = Number(bankTxn.body.data.id);
    expect(transactionId).toBeGreaterThan(0);

    const reconMatch = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId });
    expect(reconMatch.status).toBe(200);
  });

  it('supports tax and currency aliases', async () => {
    const createTaxCategory = await request(app)
      .post('/api/tax-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'VAT15', nameAr: 'ضريبة القيمة', rate: 15, isActive: true });
    expect(createTaxCategory.status).toBe(201);

    const getZatca = await request(app).get('/api/zatca/settings').set('Authorization', `Bearer ${token}`);
    expect(getZatca.status).toBe(200);

    const currencyCode = `${uniqueCode('CUR')}-${Date.now()}`.toUpperCase();
    const createCurrency = await request(app)
      .post('/api/currencies')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: currencyCode, nameAr: 'عملة اختبار', isBase: false, isActive: true });
    expect([200, 201]).toContain(createCurrency.status);

    const getCurrency = await request(app).get(`/api/currencies/${currencyCode}`).set('Authorization', `Bearer ${token}`);
    expect(getCurrency.status).toBe(200);
  });

  it('supports ticket and payroll aliases', async () => {
    const ticketCreate = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        number: uniqueCode('TCK'),
        customerId,
        subject: 'Test Ticket',
        description: 'Compatibility test'
      });
    expect(ticketCreate.status).toBe(201);
    const ticketId = Number(ticketCreate.body.data.id);
    expect(ticketId).toBeGreaterThan(0);

    const ticketComment = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'comment' });
    expect(ticketComment.status).toBe(201);

    const employee = await prisma.employee.create({
      data: {
        code: uniqueCode('EMP'),
        fullName: 'موظف اختبار',
        status: 'ACTIVE',
        baseSalary: 1000,
        allowances: 100
      }
    });
    expect(employee.id).toBeGreaterThan(0);

    const payrollGenerate = await request(app)
      .post('/api/payroll/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, month: 3 });
    expect(payrollGenerate.status).toBe(201);
  });

  it('supports remaining inventory, assets, crm and role aliases', async () => {
    const categoryCode = uniqueCode('CAT');
    const categoryCreate = await request(app)
      .post('/api/product-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: categoryCode, nameAr: 'Test Category' });
    expect(categoryCreate.status).toBe(201);
    const categoryId = Number(categoryCreate.body.data.id);

    const uomCode = uniqueCode('UOM');
    const uomCreate = await request(app)
      .post('/api/uoms')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: uomCode, nameAr: 'Unit Test' });
    expect(uomCreate.status).toBe(201);
    const uomId = Number(uomCreate.body.data.id);

    const warehouse = await prisma.warehouse.create({
      data: { code: uniqueCode('WH'), nameAr: 'Main Warehouse' }
    });

    const item = await prisma.item.create({
      data: {
        code: uniqueCode('ITM'),
        nameAr: 'Inventory Item',
        categoryId,
        unitId: uomId,
        salePrice: 10,
        purchasePrice: 8
      }
    });

    await prisma.stockBalance.create({
      data: {
        itemId: item.id,
        warehouseId: warehouse.id,
        locationId: null,
        quantity: 5,
        avgCost: 8,
        value: 40
      }
    });

    const warehouseStock = await request(app)
      .get(`/api/warehouses/${warehouse.id}/stock`)
      .set('Authorization', `Bearer ${token}`);
    expect(warehouseStock.status).toBe(200);
    expect(warehouseStock.body.success).toBe(true);
    expect(warehouseStock.body.data.summary.lines).toBeGreaterThan(0);

    const assetCategory = await prisma.assetCategory.create({
      data: { code: uniqueCode('ACAT'), nameAr: 'Office Assets', usefulLifeMonths: 60 }
    });

    const asset = await prisma.fixedAsset.create({
      data: {
        code: uniqueCode('AST'),
        nameAr: 'Laptop',
        categoryId: assetCategory.id,
        purchaseCost: 2500,
        netBookValue: 2500
      }
    });

    await prisma.depreciationSchedule.create({
      data: {
        assetId: asset.id,
        fiscalYear: 2026,
        period: 3,
        openingNBV: 2500,
        expense: 100,
        accumulated: 100,
        closingNBV: 2400,
        status: 'Pending'
      }
    });

    const assetDep = await request(app)
      .get(`/api/assets/${asset.id}/depreciation`)
      .set('Authorization', `Bearer ${token}`);
    expect(assetDep.status).toBe(200);
    expect(Array.isArray(assetDep.body.data)).toBe(true);
    expect(assetDep.body.data.length).toBeGreaterThan(0);

    const depSchedules = await request(app)
      .get(`/api/depreciation-schedules?assetId=${asset.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(depSchedules.status).toBe(200);
    expect(depSchedules.body.success).toBe(true);

    const opp = await prisma.opportunity.create({ data: { title: uniqueCode('OPP') } });
    const stageRes = await request(app)
      .patch(`/api/opportunities/${opp.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOTIATION', probability: 65 });
    expect(stageRes.status).toBe(200);
    expect(stageRes.body.data.stage).toBe('NEGOTIATION');

    const role = await prisma.role.findFirst({ orderBy: { id: 'asc' } });
    expect(role).toBeTruthy();
    const roleRes = await request(app)
      .get(`/api/roles/${role!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(roleRes.status).toBe(200);
    expect(roleRes.body.success).toBe(true);
  });

  it('supports contract actions and setup wizard aliases', async () => {
    const contract = await prisma.contract.create({
      data: {
        number: uniqueCode('CON'),
        title: 'عقد اختبار',
        partyType: 'SUPPLIER',
        partyId: supplierId,
        startDate: new Date()
      }
    });
    const contractId = contract.id;

    const approveRes = await request(app).post(`/api/contracts/${contractId}/approve`).set('Authorization', `Bearer ${token}`);
    expect(approveRes.status).toBe(200);

    const wizardStep = await request(app)
      .post('/api/setup-wizard/step/company')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(wizardStep.status).toBe(200);
  });
});
