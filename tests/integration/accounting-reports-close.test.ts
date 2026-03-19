import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Accounting events, dimension reports, and month close', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('supports dimension-filtered reports and emits accounting events before closing the month', async () => {
    const token = await loginAdmin();
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    expect(admin).toBeTruthy();

    let projectId = 0;
    let departmentId = 0;
    let costCenterId = 0;
    let fiscalYearId = 0;
    let periodId = 0;
    let cashAccountId = 0;
    let revenueAccountId = 0;
    let expenseAccountId = 0;
    let bankAccountId = 0;
    let warehouseId = 0;
    let itemId = 0;
    let supplierId = 0;
    let purchaseRequestId = 0;
    let purchaseOrderId = 0;
    const journalEntryIds: number[] = [];

    try {
      const projectRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('PRJ-ACC'),
          nameAr: 'مشروع التقارير المحاسبية',
          status: 'Active',
          isActive: true,
          actualCost: 0
        });
      expect(projectRes.status).toBe(201);
      projectId = Number(projectRes.body.data.id);

      const department = await prisma.department.create({
        data: {
          code: uniqueCode('DEPT'),
          nameAr: 'قسم المشروع'
        }
      });
      departmentId = department.id;

      const costCenter = await prisma.costCenter.create({
        data: {
          code: uniqueCode('CC'),
          nameAr: 'مركز تكلفة المشروع'
        }
      });
      costCenterId = costCenter.id;

      const fiscalYear = await prisma.fiscalYear.create({
        data: {
          name: uniqueCode('FY-2026'),
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T23:59:59.000Z'),
          status: 'OPEN'
        }
      });
      fiscalYearId = fiscalYear.id;

      const period = await prisma.accountingPeriod.create({
        data: {
          fiscalYearId,
          number: 1,
          name: 'يناير 2026',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-31T23:59:59.000Z'),
          status: 'OPEN',
          canPost: true
        }
      });
      periodId = period.id;

      const cashAccount = await prisma.account.create({
        data: {
          code: uniqueCode('ACC-CASH'),
          nameAr: 'نقدية المشروع',
          type: 'ASSET',
          normalBalance: 'Debit'
        }
      });
      cashAccountId = cashAccount.id;

      const revenueAccount = await prisma.account.create({
        data: {
          code: uniqueCode('ACC-REV'),
          nameAr: 'إيراد المشروع',
          type: 'REVENUE',
          normalBalance: 'Credit'
        }
      });
      revenueAccountId = revenueAccount.id;

      const expenseAccount = await prisma.account.create({
        data: {
          code: uniqueCode('ACC-EXP'),
          nameAr: 'مصروف المشروع',
          type: 'EXPENSE',
          normalBalance: 'Debit'
        }
      });
      expenseAccountId = expenseAccount.id;

      const bankAccount = await prisma.bankAccount.create({
        data: {
          name: 'حساب نقدية المشروع',
          accountNumber: uniqueCode('BANK'),
          bankName: 'ERP Bank',
          glAccountId: cashAccountId
        }
      });
      bankAccountId = bankAccount.id;

      const salesEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: uniqueCode('JE-SALES'),
          date: new Date('2026-01-10T00:00:00.000Z'),
          periodId,
          description: 'إثبات إيراد مشروع',
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: 100,
          totalCredit: 100,
          createdById: admin!.id,
          postedById: admin!.id,
          postedAt: new Date('2026-01-10T00:00:00.000Z')
        }
      });
      journalEntryIds.push(salesEntry.id);

      await prisma.journalLine.createMany({
        data: [
          {
            entryId: salesEntry.id,
            lineNumber: 1,
            accountId: cashAccountId,
            debit: 100,
            credit: 0,
            projectId,
            departmentId,
            costCenterId
          },
          {
            entryId: salesEntry.id,
            lineNumber: 2,
            accountId: revenueAccountId,
            debit: 0,
            credit: 100,
            projectId,
            departmentId,
            costCenterId
          }
        ]
      });

      const expenseEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: uniqueCode('JE-EXP'),
          date: new Date('2026-01-15T00:00:00.000Z'),
          periodId,
          description: 'إثبات مصروف مشروع',
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: 40,
          totalCredit: 40,
          createdById: admin!.id,
          postedById: admin!.id,
          postedAt: new Date('2026-01-15T00:00:00.000Z')
        }
      });
      journalEntryIds.push(expenseEntry.id);

      await prisma.journalLine.createMany({
        data: [
          {
            entryId: expenseEntry.id,
            lineNumber: 1,
            accountId: expenseAccountId,
            debit: 40,
            credit: 0,
            projectId,
            departmentId,
            costCenterId
          },
          {
            entryId: expenseEntry.id,
            lineNumber: 2,
            accountId: cashAccountId,
            debit: 0,
            credit: 40,
            projectId,
            departmentId,
            costCenterId
          }
        ]
      });

      const draftEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: uniqueCode('JE-DRAFT'),
          date: new Date('2026-01-20T00:00:00.000Z'),
          periodId,
          description: 'مسودة يجب أن تمنع الإقفال',
          source: 'MANUAL',
          status: 'DRAFT',
          totalDebit: 10,
          totalCredit: 10,
          createdById: admin!.id
        }
      });
      journalEntryIds.push(draftEntry.id);

      await prisma.journalLine.createMany({
        data: [
          {
            entryId: draftEntry.id,
            lineNumber: 1,
            accountId: expenseAccountId,
            debit: 10,
            credit: 0,
            projectId,
            departmentId,
            costCenterId
          },
          {
            entryId: draftEntry.id,
            lineNumber: 2,
            accountId: cashAccountId,
            debit: 0,
            credit: 10,
            projectId,
            departmentId,
            costCenterId
          }
        ]
      });

      const projectExpenseRes = await request(app)
        .post(`/api/projects/${projectId}/expenses`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 25,
          category: 'SERVICES',
          description: 'مصروف تشغيلي'
        });
      expect(projectExpenseRes.status).toBe(201);

      const warehouse = await prisma.warehouse.create({
        data: {
          code: uniqueCode('WH-ACC'),
          nameAr: 'مستودع المحاسبة'
        }
      });
      warehouseId = warehouse.id;

      const item = await prisma.item.create({
        data: {
          code: uniqueCode('ITEM-ACC'),
          nameAr: 'صنف محاسبي'
        }
      });
      itemId = item.id;

      const movementRes = await request(app)
        .post('/api/stock-movements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'ADJUSTMENT',
          reference: uniqueCode('MOV-ACC'),
          itemId,
          warehouseId,
          quantity: 5,
          unitCost: 12,
          totalCost: 60
        });
      expect(movementRes.status).toBe(201);

      const supplierRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('SUP-ACC'),
          nameAr: 'مورد محاسبي'
        });
      expect(supplierRes.status).toBe(200);
      supplierId = Number(supplierRes.body.data.id);

      const purchaseRequestRes = await request(app)
        .post('/api/purchase-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          supplierId,
          projectId,
          notes: 'طلب شراء لأغراض المحاسبة',
          lines: [
            {
              description: 'توريد مواد',
              quantity: 1,
              unitPrice: 200,
              taxRate: 15
            }
          ]
        });
      expect(purchaseRequestRes.status).toBe(201);
      purchaseRequestId = Number(purchaseRequestRes.body.data.id);

      const approveRes = await request(app)
        .post(`/api/purchase-requests/${purchaseRequestId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(approveRes.status).toBe(200);

      const convertRes = await request(app)
        .post(`/api/purchase-requests/${purchaseRequestId}/convert-to-order`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(convertRes.status).toBe(200);
      purchaseOrderId = Number(convertRes.body.data.purchaseOrderId);
      expect(convertRes.body.data.duplicate).toBe(false);

      const trialBalanceRes = await request(app)
        .get(`/api/reports/trial-balance?projectId=${projectId}&fiscalYear=2026&period=1`)
        .set('Authorization', `Bearer ${token}`);
      expect(trialBalanceRes.status).toBe(200);
      expect(Number(trialBalanceRes.body.data.totals.debit)).toBeCloseTo(140, 2);
      expect(Number(trialBalanceRes.body.data.totals.credit)).toBeCloseTo(140, 2);

      const incomeRes = await request(app)
        .get(
          `/api/reports/income-statement?projectId=${projectId}&departmentId=${departmentId}&costCenterId=${costCenterId}&dateFrom=2026-01-01&dateTo=2026-01-31`
        )
        .set('Authorization', `Bearer ${token}`);
      expect(incomeRes.status).toBe(200);
      expect(Number(incomeRes.body.data.totalRevenue)).toBeCloseTo(100, 2);
      expect(Number(incomeRes.body.data.totalExpenses)).toBeCloseTo(40, 2);
      expect(Number(incomeRes.body.data.netIncome)).toBeCloseTo(60, 2);

      const cashFlowRes = await request(app)
        .get(`/api/reports/cash-flow?projectId=${projectId}&dateFrom=2026-01-01&dateTo=2026-01-31`)
        .set('Authorization', `Bearer ${token}`);
      expect(cashFlowRes.status).toBe(200);
      expect(Number(cashFlowRes.body.data.operatingInflow)).toBeCloseTo(100, 2);
      expect(Number(cashFlowRes.body.data.operatingOutflow)).toBeCloseTo(40, 2);
      expect(Number(cashFlowRes.body.data.netCashFlow)).toBeCloseTo(60, 2);

      const closeCheckRes = await request(app)
        .get(`/api/accounting/month-close/check/${periodId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(closeCheckRes.status).toBe(200);
      expect(closeCheckRes.body.data.canClose).toBe(false);
      expect(closeCheckRes.body.data.checks.draftEntries).toBe(1);

      await prisma.journalEntry.update({
        where: { id: draftEntry.id },
        data: {
          status: 'POSTED',
          postedById: admin!.id,
          postedAt: new Date('2026-01-20T00:00:00.000Z')
        }
      });

      const closeRes = await request(app)
        .post('/api/accounting/month-close')
        .set('Authorization', `Bearer ${token}`)
        .send({ periodId });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.period.status).toBe('CLOSED');

      const eventsRes = await request(app)
        .get('/api/accounting/events?limit=200')
        .set('Authorization', `Bearer ${token}`);
      expect(eventsRes.status).toBe(200);

      const eventNames = eventsRes.body.data.map((event: { name: string }) => event.name);
      expect(eventNames).toEqual(
        expect.arrayContaining([
          'project.expense.recorded',
          'inventory.movement.recorded',
          'procurement.purchase_request.converted',
          'period.month_closed'
        ])
      );
    } finally {
      if (purchaseOrderId) {
        await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId } });
        await prisma.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
      }
      if (purchaseRequestId) {
        await prisma.purchaseRequestLine.deleteMany({ where: { purchaseRequestId } });
        await prisma.purchaseRequest.deleteMany({ where: { id: purchaseRequestId } });
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { id: supplierId } });
      }
      if (itemId) {
        await prisma.stockMovement.deleteMany({ where: { itemId } });
        await prisma.stockBalance.deleteMany({ where: { itemId } });
        await prisma.item.deleteMany({ where: { id: itemId } });
      }
      if (warehouseId) {
        await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
      }
      if (journalEntryIds.length) {
        await prisma.journalEntry.deleteMany({ where: { id: { in: journalEntryIds } } });
      }
      if (bankAccountId) {
        await prisma.bankAccount.deleteMany({ where: { id: bankAccountId } });
      }
      const accountIds = [cashAccountId, revenueAccountId, expenseAccountId].filter(Boolean);
      if (accountIds.length) {
        await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
      }
      if (periodId) {
        await prisma.accountingPeriod.deleteMany({ where: { id: periodId } });
      }
      if (fiscalYearId) {
        await prisma.fiscalYear.deleteMany({ where: { id: fiscalYearId } });
      }
      if (departmentId) {
        await prisma.department.deleteMany({ where: { id: departmentId } });
      }
      if (costCenterId) {
        await prisma.costCenter.deleteMany({ where: { id: costCenterId } });
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
    }
  });
});
