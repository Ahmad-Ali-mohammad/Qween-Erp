import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Contracts system', () => {
  let token = '';
  let branchId = 0;
  let customerId = 0;
  let contractId = 0;
  let completedMilestoneId = 0;
  let deletedMilestoneId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.contractMilestone.deleteMany({ where: { contractId } });
      await prisma.contract.deleteMany({ where: { id: contractId } });
    }
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it('closes contracts end-to-end through the canonical namespace', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('CTRBR'),
          nameAr: 'فرع العقود'
        }
      })
    ).id;

    customerId = (
      await prisma.customer.create({
        data: {
          code: uniqueCode('CTRCUS'),
          nameAr: 'عميل العقود',
          branchId
        }
      })
    ).id;

    const createContract = await request(app).post('/api/contracts').set(auth()).send({
      number: uniqueCode('CTR'),
      branchId,
      title: 'عقد نظام العقود',
      partyType: 'CUSTOMER',
      partyId: customerId,
      type: 'SERVICE',
      startDate: '2026-03-21T00:00:00.000Z',
      value: 25000,
      status: 'DRAFT',
      terms: 'شروط تعاقدية للاختبار'
    });
    expect(createContract.status).toBe(201);
    contractId = Number(createContract.body.data.id);
    expect(contractId).toBeGreaterThan(0);

    const listContracts = await request(app).get('/api/contracts').set(auth());
    expect(listContracts.status).toBe(200);
    expect(listContracts.body.data.some((row: any) => Number(row.id) === contractId)).toBe(true);

    const getContract = await request(app).get(`/api/contracts/${contractId}`).set(auth());
    expect(getContract.status).toBe(200);
    expect(getContract.body.data.partyLabel).toContain('عميل العقود');

    const updateContract = await request(app).put(`/api/contracts/${contractId}`).set(auth()).send({
      title: 'عقد نظام العقود - محدث',
      value: 30000
    });
    expect(updateContract.status).toBe(200);
    expect(updateContract.body.data.title).toBe('عقد نظام العقود - محدث');

    const renewBeforeApprove = await request(app).post(`/api/contracts/${contractId}/renew`).set(auth()).send({ months: 6 });
    expect(renewBeforeApprove.status).toBe(400);

    const approveContract = await request(app).post(`/api/contracts/${contractId}/approve`).set(auth()).send({});
    expect(approveContract.status).toBe(200);
    expect(approveContract.body.data.status).toBe('APPROVED');

    const renewContract = await request(app).post(`/api/contracts/${contractId}/renew`).set(auth()).send({ months: 3 });
    expect(renewContract.status).toBe(200);
    expect(renewContract.body.data.status).toBe('RENEWED');

    const createMilestone = await request(app).post(`/api/contracts/${contractId}/milestones`).set(auth()).send({
      title: 'مرحلة معتمدة',
      dueDate: '2026-05-01T00:00:00.000Z',
      amount: 5000,
      status: 'PENDING',
      notes: 'مرحلة سيتم إكمالها'
    });
    expect(createMilestone.status).toBe(201);
    completedMilestoneId = Number(createMilestone.body.data.id);

    const milestoneList = await request(app).get(`/api/contracts/${contractId}/milestones`).set(auth());
    expect(milestoneList.status).toBe(200);
    expect(milestoneList.body.data.some((row: any) => Number(row.id) === completedMilestoneId)).toBe(true);

    const updateMilestoneViaAlias = await request(app).put(`/api/milestones/${completedMilestoneId}`).set(auth()).send({
      notes: 'مرحلة تم تحديثها عبر alias'
    });
    expect(updateMilestoneViaAlias.status).toBe(200);
    expect(updateMilestoneViaAlias.body.data.notes).toBe('مرحلة تم تحديثها عبر alias');

    const completeMilestoneViaAlias = await request(app).post(`/api/milestones/${completedMilestoneId}/complete`).set(auth()).send({});
    expect(completeMilestoneViaAlias.status).toBe(200);
    expect(completeMilestoneViaAlias.body.data.status).toBe('COMPLETED');

    const createDeletableMilestone = await request(app).post(`/api/contracts/${contractId}/milestones`).set(auth()).send({
      title: 'مرحلة للحذف',
      dueDate: '2026-06-01T00:00:00.000Z',
      amount: 2500,
      status: 'PENDING'
    });
    expect(createDeletableMilestone.status).toBe(201);
    deletedMilestoneId = Number(createDeletableMilestone.body.data.id);

    const deleteMilestoneViaCanonical = await request(app).delete(`/api/contracts/milestones/${deletedMilestoneId}`).set(auth());
    expect(deleteMilestoneViaCanonical.status).toBe(200);
    expect(deleteMilestoneViaCanonical.body.data.deleted).toBe(true);

    const terminateContract = await request(app).post(`/api/contracts/${contractId}/terminate`).set(auth()).send({});
    expect(terminateContract.status).toBe(200);
    expect(terminateContract.body.data.status).toBe('TERMINATED');

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const dashboardResponse = await request(app).get(`/api/contracts/dashboard/${section}`).set(auth());
      expect(dashboardResponse.status).toBe(200);
      expect(Array.isArray(dashboardResponse.body.data)).toBe(true);
    }

    const [contractRow, milestoneRow, outboxEvents] = await Promise.all([
      prisma.contract.findUnique({ where: { id: contractId } }),
      prisma.contractMilestone.findUnique({ where: { id: completedMilestoneId } }),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'contracts.contract.created',
              'contracts.contract.updated',
              'contracts.contract.approved',
              'contracts.contract.renewed',
              'contracts.contract.terminated',
              'contracts.milestone.created',
              'contracts.milestone.updated',
              'contracts.milestone.completed',
              'contracts.milestone.deleted'
            ]
          },
          aggregateId: {
            in: [String(contractId), String(completedMilestoneId), String(deletedMilestoneId)]
          }
        }
      })
    ]);

    expect(contractRow?.status).toBe('TERMINATED');
    expect(milestoneRow?.status).toBe('COMPLETED');

    const eventTypes = new Set(outboxEvents.map((event) => event.eventType));
    expect(eventTypes.has('contracts.contract.created')).toBe(true);
    expect(eventTypes.has('contracts.contract.updated')).toBe(true);
    expect(eventTypes.has('contracts.contract.approved')).toBe(true);
    expect(eventTypes.has('contracts.contract.renewed')).toBe(true);
    expect(eventTypes.has('contracts.contract.terminated')).toBe(true);
    expect(eventTypes.has('contracts.milestone.created')).toBe(true);
    expect(eventTypes.has('contracts.milestone.updated')).toBe(true);
    expect(eventTypes.has('contracts.milestone.completed')).toBe(true);
    expect(eventTypes.has('contracts.milestone.deleted')).toBe(true);
  });
});
