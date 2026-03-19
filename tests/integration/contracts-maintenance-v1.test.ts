import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Contracts and maintenance alias routes v1', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('supports contracts and maintenance flows through alias routes', async () => {
    let customerId = 0;
    let opportunityId = 0;
    let convertedContractId = 0;
    let contractId = 0;
    let projectId = 0;
    let milestoneId = 0;
    let supplierId = 0;
    let categoryId = 0;
    let assetId = 0;
    let maintenanceId = 0;

    try {
      const customerRes = await request(app)
        .post('/api/v1/crm/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('CUST-CTR'),
          nameAr: 'عميل اختبار العقود',
          phone: '96551111111'
        });

      expect([200, 201]).toContain(customerRes.status);
      customerId = Number(customerRes.body.data.id);

      const opportunityRes = await request(app)
        .post('/api/v1/crm/opportunities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: uniqueCode('OPP-CTR'),
          customerId,
          stage: 'QUALIFIED',
          probability: 80,
          expectedCloseDate: '2026-06-30',
          value: 18000,
          status: 'OPEN'
        });

      expect(opportunityRes.status).toBe(201);
      opportunityId = Number(opportunityRes.body.data.id);

      const convertOpportunityRes = await request(app)
        .post(`/api/v1/contracts/opportunities/${opportunityId}/convert-to-contract`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'CONSTRUCTION',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          status: 'APPROVED'
        });

      expect(convertOpportunityRes.status).toBe(200);
      expect(convertOpportunityRes.body.data.duplicate).toBe(false);
      convertedContractId = Number(convertOpportunityRes.body.data.contractId);

      const createContractRes = await request(app)
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: uniqueCode('CTR'),
          partyType: 'CUSTOMER',
          partyId: customerId,
          type: 'CONSTRUCTION',
          startDate: '2026-05-01',
          endDate: '2026-11-30',
          value: 24500,
          status: 'DRAFT',
          terms: 'شروط عقد اختبارية'
        });

      expect(createContractRes.status).toBe(201);
      contractId = Number(createContractRes.body.data.id);

      const approveContractRes = await request(app)
        .post(`/api/v1/contracts/${contractId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(approveContractRes.status).toBe(200);
      expect(approveContractRes.body.data.status).toBe('APPROVED');

      const createMilestoneRes = await request(app)
        .post(`/api/v1/contracts/${contractId}/milestones`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'دفعة أولى',
          dueDate: '2026-06-15T00:00:00.000Z',
          amount: 5000,
          status: 'PLANNED'
        });

      expect(createMilestoneRes.status).toBe(201);
      milestoneId = Number(createMilestoneRes.body.data.id);

      const milestoneListRes = await request(app)
        .get(`/api/v1/contracts/${contractId}/milestones`)
        .set('Authorization', `Bearer ${token}`);

      expect(milestoneListRes.status).toBe(200);
      expect(milestoneListRes.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: milestoneId, title: 'دفعة أولى' })])
      );

      const convertProjectRes = await request(app)
        .post(`/api/v1/contracts/${contractId}/convert-to-project`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nameAr: 'مشروع من عقد aliases',
          status: 'PLANNED',
          budget: 24500
        });

      expect(convertProjectRes.status).toBe(200);
      expect(convertProjectRes.body.data.duplicate).toBe(false);
      projectId = Number(convertProjectRes.body.data.projectId);

      const supplierRes = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('SUP-MAIN'),
          nameAr: 'مورد صيانة aliases'
        });

      expect([200, 201]).toContain(supplierRes.status);
      supplierId = Number(supplierRes.body.data.id);

      const categoryRes = await request(app)
        .post('/api/v1/assets/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('AST-CAT'),
          nameAr: 'فئة أصول صيانة',
          usefulLifeMonths: 48
        });

      expect(categoryRes.status).toBe(201);
      categoryId = Number(categoryRes.body.data.id);

      const assetRes = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('AST'),
          nameAr: 'مولد موقع',
          categoryId,
          purchaseDate: '2026-01-01',
          purchaseCost: 9000
        });

      expect(assetRes.status).toBe(201);
      assetId = Number(assetRes.body.data.id);

      const createMaintenanceRes = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assetId,
          projectId,
          supplierId,
          serviceDate: '2026-06-20',
          type: 'CORRECTIVE',
          cost: 75,
          description: 'صيانة عبر alias route'
        });

      expect(createMaintenanceRes.status).toBe(201);
      maintenanceId = Number(createMaintenanceRes.body.data.id);

      const completeMaintenanceRes = await request(app)
        .post(`/api/v1/maintenance/${maintenanceId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          completedAt: '2026-06-21',
          cost: 80
        });

      expect(completeMaintenanceRes.status).toBe(200);
      expect(completeMaintenanceRes.body.data.status).toBe('COMPLETED');

      const maintenanceDetailRes = await request(app)
        .get(`/api/v1/maintenance/${maintenanceId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(maintenanceDetailRes.status).toBe(200);
      expect(maintenanceDetailRes.body.data.project.id).toBe(projectId);

      const costSummaryRes = await request(app)
        .get(`/api/v1/projects/${projectId}/cost-summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(costSummaryRes.status).toBe(200);
      expect(Number(costSummaryRes.body.data.summary.actualCost)).toBeGreaterThanOrEqual(80);
    } finally {
      if (maintenanceId) {
        await prisma.maintenanceLog.deleteMany({ where: { id: maintenanceId } });
      }
      if (assetId) {
        await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
      }
      if (categoryId) {
        await prisma.assetCategory.deleteMany({ where: { id: categoryId } });
      }
      if (projectId) {
        await prisma.projectExpense.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (milestoneId) {
        await prisma.contractMilestone.deleteMany({ where: { id: milestoneId } });
      }
      if (contractId) {
        await prisma.contract.deleteMany({ where: { id: contractId } });
      }
      if (convertedContractId) {
        await prisma.contract.deleteMany({ where: { id: convertedContractId } });
      }
      if (opportunityId) {
        await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { id: supplierId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
    }
  });
});
