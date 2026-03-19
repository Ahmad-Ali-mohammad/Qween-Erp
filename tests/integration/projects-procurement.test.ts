import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Projects costing and procurement request workflows', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('tracks project phases, budgets, change orders, and recalculated costs', async () => {
    const projectCode = uniqueCode('PRJ-COST');

    const projectRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: projectCode,
        nameAr: 'مشروع تكلفة',
        status: 'Active',
        isActive: true,
        actualCost: 0
      });
    expect(projectRes.status).toBe(201);
    const projectId = Number(projectRes.body.data.id);

    const phaseRes = await request(app)
      .post(`/api/projects/${projectId}/phases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nameAr: 'مرحلة التنفيذ',
        sequence: 1,
        budget: 1200
      });
    expect(phaseRes.status).toBe(201);
    const phaseId = Number(phaseRes.body.data.id);

    const budgetRes = await request(app)
      .post(`/api/projects/${projectId}/budgets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phaseId,
        category: 'EXECUTION',
        baselineAmount: 1000,
        approvedAmount: 1200,
        committedAmount: 300,
        actualAmount: 0
      });
    expect(budgetRes.status).toBe(201);

    const changeOrderRes = await request(app)
      .post(`/api/projects/${projectId}/change-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phaseId,
        title: 'أمر تغيير',
        amount: 300,
        impactDays: 5
      });
    expect(changeOrderRes.status).toBe(201);
    const changeOrderId = Number(changeOrderRes.body.data.id);

    const approveChangeOrder = await request(app)
      .post(`/api/change-orders/${changeOrderId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveChangeOrder.status).toBe(200);

    const expenseRes = await request(app)
      .post(`/api/projects/${projectId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phaseId,
        amount: 450,
        category: 'MATERIAL',
        description: 'مواد'
      });
    expect(expenseRes.status).toBe(201);
    const expenseId = Number(expenseRes.body.data.id);

    const summaryRes = await request(app)
      .get(`/api/projects/${projectId}/cost-summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(summaryRes.status).toBe(200);
    expect(Number(summaryRes.body.data.summary.approvedBudget)).toBeCloseTo(1200, 2);
    expect(Number(summaryRes.body.data.summary.approvedChangeOrders)).toBeCloseTo(300, 2);
    expect(Number(summaryRes.body.data.summary.actualCost)).toBeCloseTo(450, 2);
    expect(Number(summaryRes.body.data.summary.totalBudgetWithChanges)).toBeCloseTo(1500, 2);
    expect(Number(summaryRes.body.data.phases[0].actualCost)).toBeCloseTo(450, 2);

    const expenseUpdate = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500 });
    expect(expenseUpdate.status).toBe(200);

    const updatedSummary = await request(app)
      .get(`/api/projects/${projectId}/cost-summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(updatedSummary.status).toBe(200);
    expect(Number(updatedSummary.body.data.summary.actualCost)).toBeCloseTo(500, 2);

    await prisma.project.delete({ where: { id: projectId } });
  });

  it('converts approved purchase requests into purchase orders', async () => {
    const supplierCode = uniqueCode('SUP-PR');

    const supplierRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: supplierCode,
        nameAr: 'مورد طلب شراء'
      });
    expect(supplierRes.status).toBe(200);
    const supplierId = Number(supplierRes.body.data.id);

    const requestRes = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        notes: 'طلب شراء اختبار',
        lines: [
          {
            description: 'توريد مواد',
            quantity: 2,
            unitPrice: 150,
            taxRate: 15
          }
        ]
      });
    expect(requestRes.status).toBe(201);
    const purchaseRequestId = Number(requestRes.body.data.id);

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
    expect(convertRes.body.data.duplicate).toBe(false);
    const purchaseOrderId = Number(convertRes.body.data.purchaseOrderId);
    expect(purchaseOrderId).toBeGreaterThan(0);

    const requestGet = await request(app)
      .get(`/api/purchase-requests/${purchaseRequestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(requestGet.status).toBe(200);
    expect(requestGet.body.data.status).toBe('CONVERTED');
    expect(Number(requestGet.body.data.purchaseOrder.id)).toBe(purchaseOrderId);

    const duplicateConvert = await request(app)
      .post(`/api/purchase-requests/${purchaseRequestId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(duplicateConvert.status).toBe(200);
    expect(duplicateConvert.body.data.duplicate).toBe(true);

    await prisma.purchaseOrder.delete({ where: { id: purchaseOrderId } });
    await prisma.purchaseRequestLine.deleteMany({ where: { purchaseRequestId } });
    await prisma.purchaseRequest.delete({ where: { id: purchaseRequestId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
  });
});
