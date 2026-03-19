import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('CRM opportunity to contract to project flow', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('converts a customer opportunity into a contract and then into a project', async () => {
    const customerCode = uniqueCode('CUST-CRM');
    const opportunityTitle = uniqueCode('OPP');

    const customerRes = await request(app)
      .post('/api/v1/crm/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: customerCode,
        nameAr: 'عميل مسار CRM',
        phone: '96550000000'
      });

    expect(customerRes.status).toBe(200);
    const customerId = Number(customerRes.body.data.id);

    const opportunityRes = await request(app)
      .post('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: opportunityTitle,
        customerId,
        stage: 'QUALIFIED',
        probability: 75,
        expectedCloseDate: '2026-03-31',
        value: 12500.5,
        status: 'OPEN',
        notes: 'فرصة مرتبطة بعقد مشروع'
      });

    expect(opportunityRes.status).toBe(201);
    expect(opportunityRes.body.auditRef).toBeTruthy();
    const opportunityId = Number(opportunityRes.body.data.id);

    const convertToContractRes = await request(app)
      .post(`/api/v1/crm/opportunities/${opportunityId}/convert-to-contract`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startDate: '2026-04-01',
        endDate: '2026-12-31',
        type: 'CONSTRUCTION',
        status: 'APPROVED'
      });

    expect(convertToContractRes.status).toBe(200);
    expect(convertToContractRes.body.data.duplicate).toBe(false);
    expect(convertToContractRes.body.auditRef).toBeTruthy();
    const contractId = Number(convertToContractRes.body.data.contractId);

    const duplicateContractRes = await request(app)
      .post(`/api/v1/crm/opportunities/${opportunityId}/convert-to-contract`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(duplicateContractRes.status).toBe(200);
    expect(duplicateContractRes.body.data.duplicate).toBe(true);
    expect(Number(duplicateContractRes.body.data.contractId)).toBe(contractId);

    const contractRes = await request(app)
      .get(`/api/v1/crm/contracts/${contractId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(contractRes.status).toBe(200);
    expect(contractRes.body.data.partyType).toBe('CUSTOMER');
    expect(Number(contractRes.body.data.partyId)).toBe(customerId);
    expect(contractRes.body.data.projects).toEqual([]);

    const convertToProjectRes = await request(app)
      .post(`/api/v1/crm/contracts/${contractId}/convert-to-project`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'PLANNED',
        nameEn: 'CRM Project Flow'
      });

    expect(convertToProjectRes.status).toBe(200);
    expect(convertToProjectRes.body.data.duplicate).toBe(false);
    expect(convertToProjectRes.body.auditRef).toBeTruthy();
    const projectId = Number(convertToProjectRes.body.data.projectId);

    const duplicateProjectRes = await request(app)
      .post(`/api/v1/crm/contracts/${contractId}/convert-to-project`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(duplicateProjectRes.status).toBe(200);
    expect(duplicateProjectRes.body.data.duplicate).toBe(true);
    expect(Number(duplicateProjectRes.body.data.projectId)).toBe(projectId);

    const createdProject = await prisma.project.findUnique({ where: { id: projectId } });
    expect(createdProject).toBeTruthy();
    expect(Number(createdProject!.contractId)).toBe(contractId);

    const updatedContractRes = await request(app)
      .get(`/api/v1/crm/contracts/${contractId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(updatedContractRes.status).toBe(200);
    expect(updatedContractRes.body.data.status).toBe('ACTIVE');
    expect(updatedContractRes.body.data.projects).toHaveLength(1);
    expect(Number(updatedContractRes.body.data.projects[0].id)).toBe(projectId);

    await prisma.project.delete({ where: { id: projectId } });
    await prisma.contract.delete({ where: { id: contractId } });
    await prisma.opportunity.delete({ where: { id: opportunityId } });
    await prisma.customer.delete({ where: { id: customerId } });
  });
});
