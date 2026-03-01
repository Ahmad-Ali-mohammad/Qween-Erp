import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 13 deep CRUD coverage (Inventory + Banks/Treasury + Budgets)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('covers inventory pages CRUD and key workflows', async () => {
    const categoryCode = uniqueCode('CAT13').toUpperCase();
    const unitCode = uniqueCode('UOM13').toUpperCase();
    const warehouseCode = uniqueCode('WH13').toUpperCase();
    const itemCode = uniqueCode('ITM13').toUpperCase();
    const countNumber = uniqueCode('CNT13').toUpperCase();
    const movementRef = uniqueCode('MOV13').toUpperCase();

    let categoryId = 0;
    let unitId = 0;
    let warehouseId = 0;
    let itemId = 0;
    let inventoryCountId = 0;
    let movementId = 0;

    try {
      const categoryCreate = await request(app).post('/api/product-categories').set(auth()).send({
        code: categoryCode,
        nameAr: 'تصنيف مرحلة 13',
        isActive: true
      });
      expect(categoryCreate.status).toBe(201);
      categoryId = Number(categoryCreate.body.data.id);

      const categoryGet = await request(app).get(`/api/product-categories/${categoryId}`).set(auth());
      expect(categoryGet.status).toBe(200);

      const categoryPut = await request(app).put(`/api/product-categories/${categoryId}`).set(auth()).send({
        nameAr: 'تصنيف مرحلة 13 - محدث'
      });
      expect(categoryPut.status).toBe(200);

      const unitCreate = await request(app).post('/api/uoms').set(auth()).send({
        code: unitCode,
        nameAr: 'وحدة مرحلة 13',
        isActive: true
      });
      expect(unitCreate.status).toBe(201);
      unitId = Number(unitCreate.body.data.id);

      const unitPut = await request(app).put(`/api/uoms/${unitId}`).set(auth()).send({
        nameAr: 'وحدة مرحلة 13 - محدثة'
      });
      expect(unitPut.status).toBe(200);

      const warehouseCreate = await request(app).post('/api/warehouses').set(auth()).send({
        code: warehouseCode,
        nameAr: 'مستودع مرحلة 13',
        location: 'Riyadh',
        isActive: true
      });
      expect(warehouseCreate.status).toBe(201);
      warehouseId = Number(warehouseCreate.body.data.id);

      const warehouseGet = await request(app).get(`/api/warehouses/${warehouseId}`).set(auth());
      expect(warehouseGet.status).toBe(200);

      const warehousePut = await request(app).put(`/api/warehouses/${warehouseId}`).set(auth()).send({
        manager: 'Inventory Lead'
      });
      expect(warehousePut.status).toBe(200);

      const itemCreate = await request(app).post('/api/products').set(auth()).send({
        code: itemCode,
        nameAr: 'صنف مرحلة 13',
        categoryId,
        unitId,
        salePrice: 25,
        purchasePrice: 18,
        reorderPoint: 5,
        minStock: 2,
        maxStock: 100,
        onHandQty: 10,
        inventoryValue: 180,
        isActive: true
      });
      expect(itemCreate.status).toBe(201);
      itemId = Number(itemCreate.body.data.id);

      const itemGet = await request(app).get(`/api/products/${itemId}`).set(auth());
      expect(itemGet.status).toBe(200);

      const itemPut = await request(app).put(`/api/products/${itemId}`).set(auth()).send({
        salePrice: 27,
        reorderPoint: 6
      });
      expect(itemPut.status).toBe(200);

      const stockByWarehouse = await request(app).get(`/api/warehouses/${warehouseId}/stock`).set(auth());
      expect(stockByWarehouse.status).toBe(200);

      const movementCreate = await request(app).post('/api/inventory-transactions').set(auth()).send({
        date: new Date().toISOString(),
        type: 'ADJUSTMENT',
        reference: movementRef,
        itemId,
        warehouseId,
        quantity: 2,
        unitCost: 18,
        totalCost: 36,
        notes: 'حركة مرحلة 13'
      });
      expect(movementCreate.status).toBe(201);
      movementId = Number(movementCreate.body.data.id);

      const movementList = await request(app).get('/api/inventory-transactions').set(auth());
      expect(movementList.status).toBe(200);

      const itemTransactions = await request(app).get(`/api/products/${itemId}/transactions`).set(auth());
      expect(itemTransactions.status).toBe(200);

      const countCreate = await request(app).post('/api/inventory-counts').set(auth()).send({
        number: countNumber,
        date: new Date().toISOString(),
        warehouseId,
        status: 'DRAFT'
      });
      expect(countCreate.status).toBe(201);
      inventoryCountId = Number(countCreate.body.data.id);

      const countItemsPut = await request(app)
        .put(`/api/inventory-counts/${inventoryCountId}/items`)
        .set(auth())
        .send({
          items: [
            {
              itemId,
              theoreticalQty: 10,
              actualQty: 11,
              unitCost: 18
            }
          ]
        });
      expect(countItemsPut.status).toBe(200);

      const countGet = await request(app).get(`/api/inventory-counts/${inventoryCountId}`).set(auth());
      expect(countGet.status).toBe(200);

      const countComplete = await request(app).post(`/api/inventory-counts/${inventoryCountId}/complete`).set(auth()).send({});
      expect(countComplete.status).toBe(200);

      const valuationReport = await request(app).get('/api/reports/inventory-valuation').set(auth());
      expect(valuationReport.status).toBe(200);

      const movementsReport = await request(app).get('/api/reports/inventory-movements').set(auth());
      expect(movementsReport.status).toBe(200);

      const lowStockReport = await request(app).get('/api/reports/low-stock').set(auth());
      expect(lowStockReport.status).toBe(200);
    } finally {
      if (inventoryCountId) {
        await prisma.stockCountLine.deleteMany({ where: { stockCountId: inventoryCountId } });
        await prisma.stockCount.deleteMany({ where: { id: inventoryCountId } });
      }
      if (movementId) {
        await prisma.stockMovement.deleteMany({ where: { id: movementId } });
      }
      if (itemId) {
        await request(app).delete(`/api/products/${itemId}`).set(auth());
      }
      if (warehouseId) {
        await request(app).delete(`/api/warehouses/${warehouseId}`).set(auth());
      }
      if (unitId) {
        await request(app).delete(`/api/uoms/${unitId}`).set(auth());
      }
      if (categoryId) {
        await request(app).delete(`/api/product-categories/${categoryId}`).set(auth());
      }
    }
  });

  it('covers banks and treasury pages with operational flows', async () => {
    const bankAccNo = uniqueCode('BA13').toUpperCase();
    const cashboxNo = uniqueCode('CB13').toUpperCase();

    let bankId = 0;
    let bankTx1Id = 0;
    let bankTx2Id = 0;
    let reconciliationId = 0;
    let cashboxId = 0;

    try {
      const bankCreate = await request(app).post('/api/bank-accounts').set(auth()).send({
        name: 'حساب بنكي مرحلة 13',
        accountNumber: bankAccNo,
        bankName: 'Bank 13',
        currency: 'SAR',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      });
      expect(bankCreate.status).toBe(201);
      bankId = Number(bankCreate.body.data.id);

      const bankGet = await request(app).get(`/api/bank-accounts/${bankId}`).set(auth());
      expect(bankGet.status).toBe(200);

      const bankPut = await request(app).put(`/api/bank-accounts/${bankId}`).set(auth()).send({
        name: 'حساب بنكي مرحلة 13 - محدث'
      });
      expect(bankPut.status).toBe(200);

      const bankTx1Create = await request(app).post('/api/bank-transactions').set(auth()).send({
        bankId,
        date: new Date().toISOString(),
        description: 'حركة بنكية 13-1',
        debit: 0,
        credit: 150
      });
      expect(bankTx1Create.status).toBe(201);
      bankTx1Id = Number(bankTx1Create.body.data.id);

      const bankTx1Get = await request(app).get(`/api/bank-transactions/${bankTx1Id}`).set(auth());
      expect(bankTx1Get.status).toBe(200);

      const bankTx1Put = await request(app).put(`/api/bank-transactions/${bankTx1Id}`).set(auth()).send({
        description: 'حركة بنكية 13-1 - محدثة'
      });
      expect(bankTx1Put.status).toBe(200);

      const bankTx1Reconcile = await request(app).post(`/api/bank-transactions/${bankTx1Id}/reconcile`).set(auth()).send({});
      expect(bankTx1Reconcile.status).toBe(200);

      const bankTx2Create = await request(app).post('/api/bank-transactions').set(auth()).send({
        bankId,
        date: new Date().toISOString(),
        description: 'حركة بنكية 13-2',
        debit: 50,
        credit: 0
      });
      expect(bankTx2Create.status).toBe(201);
      bankTx2Id = Number(bankTx2Create.body.data.id);

      const reconciliationCreate = await request(app).post('/api/bank-reconciliations').set(auth()).send({
        bankId,
        statementBalance: 1100,
        statementDate: new Date().toISOString()
      });
      expect(reconciliationCreate.status).toBe(201);
      reconciliationId = Number(reconciliationCreate.body.data.id);

      const reconciliationGet = await request(app).get(`/api/bank-reconciliations/${reconciliationId}`).set(auth());
      expect(reconciliationGet.status).toBe(200);

      const reconciliationMatch = await request(app)
        .post(`/api/bank-reconciliations/${reconciliationId}/match`)
        .set(auth())
        .send({ transactionId: bankTx2Id });
      expect(reconciliationMatch.status).toBe(200);

      const reconciliationComplete = await request(app)
        .post(`/api/bank-reconciliations/${reconciliationId}/complete`)
        .set(auth())
        .send({});
      expect(reconciliationComplete.status).toBe(200);

      const cashboxCreate = await request(app).post('/api/cashboxes').set(auth()).send({
        name: 'صندوق مرحلة 13',
        accountNumber: cashboxNo,
        bankName: 'Cashbox',
        currency: 'SAR',
        openingBalance: 300,
        currentBalance: 300,
        isActive: true
      });
      expect(cashboxCreate.status).toBe(201);
      cashboxId = Number(cashboxCreate.body.data.id);

      const cashboxGet = await request(app).get(`/api/cashboxes/${cashboxId}`).set(auth());
      expect(cashboxGet.status).toBe(200);

      const cashboxPut = await request(app).put(`/api/cashboxes/${cashboxId}`).set(auth()).send({
        name: 'صندوق مرحلة 13 - محدث'
      });
      expect(cashboxPut.status).toBe(200);

      const cashTxnCreate = await request(app).post('/api/cash-transactions').set(auth()).send({
        cashboxId,
        direction: 'DEPOSIT',
        amount: 120,
        date: new Date().toISOString(),
        description: 'إيداع صندوق 13'
      });
      expect(cashTxnCreate.status).toBe(201);

      const cashTxnList = await request(app).get('/api/cash-transactions').set(auth()).query({ cashboxId });
      expect(cashTxnList.status).toBe(200);

      const bankStatementReport = await request(app)
        .get(`/api/reports/bank-statement/${bankId}`)
        .set(auth())
        .query({ fromDate: '2026-01-01', toDate: '2026-12-31' });
      expect(bankStatementReport.status).toBe(200);

      const bankReconReport = await request(app).get('/api/reports/bank-reconciliation').set(auth());
      expect(bankReconReport.status).toBe(200);

      const bankTx2Delete = await request(app).delete(`/api/bank-transactions/${bankTx2Id}`).set(auth());
      expect(bankTx2Delete.status).toBe(200);
      bankTx2Id = 0;

      const bankTx1Delete = await request(app).delete(`/api/bank-transactions/${bankTx1Id}`).set(auth());
      expect(bankTx1Delete.status).toBe(200);
      bankTx1Id = 0;

      const cashboxDelete = await request(app).delete(`/api/cashboxes/${cashboxId}`).set(auth());
      expect(cashboxDelete.status).toBe(200);
      cashboxId = 0;

      const bankDelete = await request(app).delete(`/api/bank-accounts/${bankId}`).set(auth());
      expect(bankDelete.status).toBe(200);
      bankId = 0;
    } finally {
      if (bankTx2Id) await request(app).delete(`/api/bank-transactions/${bankTx2Id}`).set(auth());
      if (bankTx1Id) await request(app).delete(`/api/bank-transactions/${bankTx1Id}`).set(auth());
      if (cashboxId) await request(app).delete(`/api/cashboxes/${cashboxId}`).set(auth());
      if (bankId) await request(app).delete(`/api/bank-accounts/${bankId}`).set(auth());
      if (reconciliationId) {
        await prisma.integrationSetting.deleteMany({ where: { key: `bank-reconciliation:${reconciliationId}` } });
      }
    }
  });

  it('covers budgets pages CRUD end-to-end', async () => {
    const budgetCode = uniqueCode('BDG13').toUpperCase();
    const accountCode = `8${String(Date.now()).slice(-7)}`;
    const fiscalYear = new Date().getUTCFullYear();

    let budgetId = 0;
    let budgetLineId = 0;
    let accountId = 0;

    try {
      const accountCreate = await request(app).post('/api/accounts').set(auth()).send({
        code: accountCode,
        nameAr: 'حساب موازنة مرحلة 13',
        type: 'EXPENSE',
        allowPosting: true,
        normalBalance: 'Debit'
      });
      expect(accountCreate.status).toBe(201);
      accountId = Number(accountCreate.body.data.id);

      const budgetCreate = await request(app).post('/api/budgets').set(auth()).send({
        code: budgetCode,
        nameAr: 'موازنة مرحلة 13',
        fiscalYear,
        status: 'DRAFT',
        controlLevel: 'WARNING',
        totalAmount: 12000
      });
      expect(budgetCreate.status).toBe(201);
      budgetId = Number(budgetCreate.body.data.id);

      const budgetGet = await request(app).get(`/api/budgets/${budgetId}`).set(auth());
      expect(budgetGet.status).toBe(200);

      const budgetPut = await request(app).put(`/api/budgets/${budgetId}`).set(auth()).send({
        nameAr: 'موازنة مرحلة 13 - محدثة',
        totalAmount: 15000
      });
      expect(budgetPut.status).toBe(200);

      const budgetApprove = await request(app).post(`/api/budgets/${budgetId}/approve`).set(auth()).send({});
      expect(budgetApprove.status).toBe(200);

      const lineCreate = await request(app).post('/api/budget-lines').set(auth()).send({
        budgetId,
        accountId,
        period: 3,
        amount: 1000,
        actual: 200,
        committed: 100,
        variance: 700
      });
      expect(lineCreate.status).toBe(201);
      budgetLineId = Number(lineCreate.body.data.id);

      const linesList = await request(app).get('/api/budget-lines').set(auth()).query({ budgetId });
      expect(linesList.status).toBe(200);

      const linePut = await request(app).put(`/api/budget-lines/${budgetLineId}`).set(auth()).send({
        amount: 1300,
        actual: 250,
        variance: 850
      });
      expect(linePut.status).toBe(200);

      const varianceReport = await request(app).get(`/api/reports/budget-variance/${budgetId}`).set(auth());
      expect(varianceReport.status).toBe(200);

      const summaryReport = await request(app).get('/api/reports/budget-summary').set(auth());
      expect(summaryReport.status).toBe(200);

      const lineDelete = await request(app).delete(`/api/budget-lines/${budgetLineId}`).set(auth());
      expect(lineDelete.status).toBe(200);
      budgetLineId = 0;

      const budgetDelete = await request(app).delete(`/api/budgets/${budgetId}`).set(auth());
      expect(budgetDelete.status).toBe(200);
      budgetId = 0;

      const accountDelete = await request(app).delete(`/api/accounts/${accountId}`).set(auth());
      expect(accountDelete.status).toBe(200);
      accountId = 0;
    } finally {
      if (budgetLineId) await request(app).delete(`/api/budget-lines/${budgetLineId}`).set(auth());
      if (budgetId) await request(app).delete(`/api/budgets/${budgetId}`).set(auth());
      if (accountId) await request(app).delete(`/api/accounts/${accountId}`).set(auth());
    }
  });
});
