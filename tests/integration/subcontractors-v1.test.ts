import request from 'supertest';
import { listAccountingEvents } from '../../src/modules/accounting/events';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Subcontractors v1 flow', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('manages subcontract contracts, certificates, and payments with project cost impact', async () => {
    let branchId = 0;
    let projectId = 0;
    let subcontractorId = 0;
    let contractId = 0;
    let workOrderId = 0;
    let changeOrderId = 0;
    let certificateId = 0;
    let paymentId = 0;
    let projectExpenseId = 0;

    try {
      const branch = await prisma.branch.create({
        data: {
          code: uniqueCode('BR-SUB'),
          nameAr: 'فرع مقاولي الباطن'
        }
      });
      branchId = branch.id;

      const project = await prisma.project.create({
        data: {
          code: uniqueCode('PRJ-SUB'),
          nameAr: 'مشروع مقاولي الباطن',
          branchId,
          status: 'ACTIVE',
          budget: 15000,
          actualCost: 0
        }
      });
      projectId = project.id;

      const subcontractorRes = await request(app)
        .post('/api/v1/subcontractors')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('SUB'),
          nameAr: 'مقاول تشطيبات',
          specialty: 'Finishing',
          phone: '96552222222'
        });

      expect(subcontractorRes.status).toBe(201);
      subcontractorId = Number(subcontractorRes.body.data.id);

      const contractRes = await request(app)
        .post(`/api/v1/subcontractors/${subcontractorId}/contracts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId,
          projectId,
          title: 'عقد تشطيبات الدور الأرضي',
          scopeOfWork: 'تشطيبات كاملة',
          startDate: '2026-03-01',
          amount: 10000,
          retentionRate: 10,
          status: 'ACTIVE'
        });

      expect(contractRes.status).toBe(201);
      contractId = Number(contractRes.body.data.id);
      expect(contractRes.body.auditRef).toBeTruthy();

      const workOrderRes = await request(app)
        .post(`/api/v1/subcontractors/contracts/${contractId}/work-orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'أمر إسناد المرحلة الأولى',
          amount: 3500
        });

      expect(workOrderRes.status).toBe(201);
      workOrderId = Number(workOrderRes.body.data.id);

      const changeOrderRes = await request(app)
        .post(`/api/v1/subcontractors/contracts/${contractId}/change-orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'زيادة أعمال جبس',
          amount: 1500
        });

      expect(changeOrderRes.status).toBe(201);
      changeOrderId = Number(changeOrderRes.body.data.id);

      const approveChangeRes = await request(app)
        .post(`/api/v1/subcontractors/change-orders/${changeOrderId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(approveChangeRes.status).toBe(200);
      expect(approveChangeRes.body.data.status).toBe('APPROVED');

      const certificateRes = await request(app)
        .post(`/api/v1/subcontractors/contracts/${contractId}/certificates`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          certificateDate: '2026-03-20',
          progressPercent: 35,
          grossAmount: 4000
        });

      expect(certificateRes.status).toBe(201);
      certificateId = Number(certificateRes.body.data.id);

      const approveCertificateRes = await request(app)
        .post(`/api/v1/subcontractors/certificates/${certificateId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(approveCertificateRes.status).toBe(200);
      expect(approveCertificateRes.body.data.status).toBe('APPROVED');
      projectExpenseId = Number(approveCertificateRes.body.data.projectExpenseId);
      expect(projectExpenseId).toBeGreaterThan(0);

      const paymentRes = await request(app)
        .post('/api/v1/subcontractors/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          certificateId,
          amount: 3600,
          method: 'BANK_TRANSFER',
          reference: uniqueCode('SCPAY')
        });

      expect(paymentRes.status).toBe(201);
      paymentId = Number(paymentRes.body.data.id);
      expect(paymentRes.body.auditRef).toBeTruthy();

      const contractDetailRes = await request(app)
        .get(`/api/v1/subcontractors/contracts/${contractId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(contractDetailRes.status).toBe(200);
      expect(Number(contractDetailRes.body.data.amount)).toBeCloseTo(11500, 3);
      expect(Number(contractDetailRes.body.data.certifiedAmount)).toBeCloseTo(4000, 3);
      expect(Number(contractDetailRes.body.data.paidAmount)).toBeCloseTo(3600, 3);
      expect(contractDetailRes.body.data.workOrders).toHaveLength(1);
      expect(contractDetailRes.body.data.changeOrders).toHaveLength(1);
      expect(contractDetailRes.body.data.certificates).toHaveLength(1);
      expect(contractDetailRes.body.data.payments).toHaveLength(1);

      const certificate = await prisma.subcontractCertificate.findUnique({ where: { id: certificateId } });
      expect(certificate).toBeTruthy();
      expect(certificate!.status).toBe('PAID');
      expect(Number(certificate!.paidAmount)).toBeCloseTo(3600, 3);

      const refreshedProject = await prisma.project.findUnique({ where: { id: projectId } });
      expect(refreshedProject).toBeTruthy();
      expect(Number(refreshedProject!.actualCost)).toBeCloseTo(4000, 3);

      const performanceRes = await request(app)
        .get(`/api/v1/subcontractors/reports/performance?branchId=${branchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(performanceRes.status).toBe(200);
      expect(performanceRes.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: subcontractorId,
            contractCount: 1,
            contractAmount: 11500,
            certifiedAmount: 4000,
            paidAmount: 3600,
            outstandingAmount: 400
          })
        ])
      );

      const events = listAccountingEvents(20).map((row) => row.name);
      expect(events).toEqual(
        expect.arrayContaining(['subcontract.certificate.approved', 'subcontract.payment.recorded', 'project.expense.recorded'])
      );
    } finally {
      if (paymentId) {
        await prisma.subcontractPayment.deleteMany({ where: { id: paymentId } });
      }
      if (certificateId) {
        await prisma.subcontractCertificate.deleteMany({ where: { id: certificateId } });
      }
      if (projectExpenseId) {
        await prisma.projectExpense.deleteMany({ where: { id: projectExpenseId } });
      }
      if (workOrderId) {
        await prisma.subcontractWorkOrder.deleteMany({ where: { id: workOrderId } });
      }
      if (changeOrderId) {
        await prisma.subcontractChangeOrder.deleteMany({ where: { id: changeOrderId } });
      }
      if (contractId) {
        await prisma.subcontractContract.deleteMany({ where: { id: contractId } });
      }
      if (subcontractorId) {
        await prisma.subcontractor.deleteMany({ where: { id: subcontractorId } });
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } });
      }
    }
  });
});
