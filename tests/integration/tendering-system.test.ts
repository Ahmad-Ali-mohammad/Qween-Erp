import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Tendering system', () => {
  let token = '';
  let branchId = 0;
  let customerId = 0;
  let opportunityId = 0;
  let tenderId = 0;
  let contractId = 0;
  let projectId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (tenderId) {
      await prisma.tender.deleteMany({ where: { id: tenderId } });
    }
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (contractId) {
      await prisma.contract.deleteMany({ where: { id: contractId } });
    }
    if (opportunityId) {
      await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
    }
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it('creates, submits, and awards a tender into contract/project with dashboard coverage', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع العطاءات'
        }
      })
    ).id;

    customerId = (
      await prisma.customer.create({
        data: {
          code: uniqueCode('CUS'),
          nameAr: 'عميل العطاءات',
          branchId
        }
      })
    ).id;

    opportunityId = (
      await prisma.opportunity.create({
        data: {
          title: 'فرصة مناقصة حكومية',
          customerId,
          stage: 'QUALIFICATION',
          probability: 60,
          value: 48000,
          ownerId: 1,
          status: 'OPEN'
        }
      })
    ).id;

    const createRes = await request(app).post('/api/tendering/tenders').set(auth()).send({
      branchId,
      customerId,
      opportunityId,
      title: 'عطاء تنفيذ مبنى إداري',
      issuerName: 'الجهة المالكة',
      bidDueDate: '2026-04-20',
      guaranteeAmount: 5000,
      estimateLines: [
        { category: 'مواد', description: 'خرسانة', costType: 'مباشر', quantity: 10, unitCost: 1000 },
        { category: 'عمالة', description: 'فريق التنفيذ', costType: 'مباشر', quantity: 20, unitCost: 400 }
      ],
      competitors: [
        { name: 'منافس أ', offeredValue: 51000, rank: 2 },
        { name: 'منافس ب', offeredValue: 53000, rank: 3 }
      ]
    });

    expect(createRes.status).toBe(201);
    tenderId = Number(createRes.body.data.id);
    expect(createRes.body.data.title).toBe('عطاء تنفيذ مبنى إداري');
    expect(createRes.body.data.estimateLines).toHaveLength(2);
    expect(Number(createRes.body.data.estimatedValue)).toBe(18000);

    const submitRes = await request(app).post(`/api/tendering/tenders/${tenderId}/submit`).set(auth()).send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');
    expect(submitRes.body.data.approvalStatus).toBe('PENDING');

    const resultRes = await request(app).post(`/api/tendering/tenders/${tenderId}/result`).set(auth()).send({
      result: 'WON',
      branchId,
      contractValue: 49000,
      contractTitle: 'عقد تنفيذ مبنى إداري',
      projectNameAr: 'مشروع مبنى إداري',
      createProject: true
    });

    expect(resultRes.status).toBe(200);
    contractId = Number(resultRes.body.data.contract?.id);
    projectId = Number(resultRes.body.data.project?.id);
    expect(resultRes.body.data.result).toBe('WON');
    expect(resultRes.body.data.status).toBe('WON');
    expect(contractId).toBeGreaterThan(0);
    expect(projectId).toBeGreaterThan(0);

    const [tender, opportunity, contract, project, dashboardRes, events] = await Promise.all([
      prisma.tender.findUnique({ where: { id: tenderId } }),
      prisma.opportunity.findUnique({ where: { id: opportunityId } }),
      prisma.contract.findUnique({ where: { id: contractId } }),
      prisma.project.findUnique({ where: { id: projectId } }),
      request(app).get('/api/tendering/dashboard/summary').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'tendering.tender.created',
              'tendering.tender.submitted',
              'tendering.tender.resulted',
              'crm.opportunity.awarded',
              'contracts.contract.activated',
              'projects.project.created'
            ]
          }
        }
      })
    ]);

    expect(tender?.result).toBe('WON');
    expect(Number(tender?.contractId)).toBe(contractId);
    expect(Number(tender?.projectId)).toBe(projectId);
    expect(opportunity?.status).toBe('WON');
    expect(contract?.title).toContain('عقد تنفيذ');
    expect(project?.nameAr).toContain('مشروع');
    expect(dashboardRes.status).toBe(200);
    expect(Array.isArray(dashboardRes.body.data)).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('tendering.tender.created')).toBe(true);
    expect(eventTypes.has('tendering.tender.submitted')).toBe(true);
    expect(eventTypes.has('tendering.tender.resulted')).toBe(true);
    expect(eventTypes.has('crm.opportunity.awarded')).toBe(true);
    expect(eventTypes.has('contracts.contract.activated')).toBe(true);
    expect(eventTypes.has('projects.project.created')).toBe(true);
  });
});
