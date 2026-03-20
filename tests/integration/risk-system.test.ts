import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Risk system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let departmentId = 0;
  let employeeId = 0;
  let riskId = 0;
  let assessmentId = 0;
  let mitigationId = 0;
  let followupId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (followupId) await prisma.riskFollowup.deleteMany({ where: { id: followupId } });
    if (mitigationId) await prisma.mitigationPlan.deleteMany({ where: { id: mitigationId } });
    if (assessmentId) await prisma.riskAssessment.deleteMany({ where: { id: assessmentId } });
    if (riskId) await prisma.riskRegister.deleteMany({ where: { id: riskId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs register, assessment, mitigation, and followup flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع إدارة المخاطر'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع المخاطر',
          branchId,
          budget: 95000
        }
      })
    ).id;

    departmentId = (
      await prisma.department.create({
        data: {
          code: uniqueCode('DEP'),
          nameAr: 'إدارة التشغيل'
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'مسؤول مخاطر',
          branchId,
          status: 'ACTIVE',
          baseSalary: 3000
        }
      })
    ).id;

    const riskCreate = await request(app).post('/api/risk/register').set(auth()).send({
      branchId,
      projectId,
      departmentId,
      ownerEmployeeId: employeeId,
      category: 'SAFETY',
      title: 'خطر تأخر توريد مادة حرجة',
      description: 'تأخر التوريد قد يسبب توقفًا في البرنامج الزمني',
      probability: 4,
      impact: 5,
      dueDate: '2030-03-30'
    });
    expect(riskCreate.status).toBe(201);
    riskId = Number(riskCreate.body.data.id);
    expect(riskCreate.body.data.project?.id).toBe(projectId);
    expect(riskCreate.body.data.department?.id).toBe(departmentId);
    expect(riskCreate.body.data.ownerEmployee?.id).toBe(employeeId);

    const assessmentCreate = await request(app).post('/api/risk/assessments').set(auth()).send({
      riskId,
      assessmentDate: '2026-03-20',
      probability: 5,
      impact: 5,
      notes: 'التعرض مرتفع ويحتاج تدخلًا فوريًا'
    });
    expect(assessmentCreate.status).toBe(201);
    assessmentId = Number(assessmentCreate.body.data.id);
    expect(assessmentCreate.body.data.severity).toBe('CRITICAL');

    const mitigationCreate = await request(app).post('/api/risk/mitigations').set(auth()).send({
      riskId,
      title: 'خطة تسريع بديل للمورد',
      description: 'إشراك مورد احتياطي وجدولة توريد عاجل',
      ownerEmployeeId: employeeId,
      dueDate: '2025-01-10'
    });
    expect(mitigationCreate.status).toBe(201);
    mitigationId = Number(mitigationCreate.body.data.id);
    expect(mitigationCreate.body.data.status).toBe('OPEN');

    const followupCreate = await request(app).post('/api/risk/followup').set(auth()).send({
      riskId,
      followupDate: '2026-03-20',
      status: 'OPEN',
      note: 'تمت المراجعة مع الإدارة التنفيذية',
      nextAction: 'تفعيل المورد الاحتياطي',
      nextReviewDate: '2025-01-15'
    });
    expect(followupCreate.status).toBe(201);
    followupId = Number(followupCreate.body.data.id);
    expect(followupCreate.body.data.status).toBe('OPEN');

    const registerList = await request(app).get('/api/risk/register').set(auth());
    expect(registerList.status).toBe(200);
    expect(registerList.body.data.some((row: any) => row.id === riskId && row.project?.id === projectId)).toBe(true);

    const mitigationList = await request(app).get('/api/risk/mitigations').set(auth());
    expect(mitigationList.status).toBe(200);
    expect(mitigationList.body.data.some((row: any) => row.id === mitigationId && row.ownerEmployee?.id === employeeId)).toBe(true);

    const followupList = await request(app).get('/api/risk/followup').set(auth());
    expect(followupList.status).toBe(200);
    expect(followupList.body.data.some((row: any) => row.id === followupId && row.risk?.id === riskId)).toBe(true);

    const controlAlerts = await request(app).get('/api/control-center/dashboard/alerts').set(auth());
    expect(controlAlerts.status).toBe(200);
    expect(controlAlerts.body.data.some((row: any) => row.key === 'risk-critical')).toBe(true);

    const controlSummary = await request(app).get('/api/control-center/dashboard/summary').set(auth());
    expect(controlSummary.status).toBe(200);
    expect(controlSummary.body.data.some((row: any) => row.key === 'exceptions' && Number(row.value) > 0)).toBe(true);

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const response = await request(app).get(`/api/risk/dashboard/${section}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const [risk, mitigation, followup, activity, events] = await Promise.all([
      prisma.riskRegister.findUnique({ where: { id: riskId } }),
      prisma.mitigationPlan.findUnique({ where: { id: mitigationId } }),
      prisma.riskFollowup.findUnique({ where: { id: followupId } }),
      request(app).get('/api/control-center/dashboard/activity').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'risk.register.created',
              'risk.assessment.recorded',
              'risk.mitigation.created',
              'risk.mitigation.overdue',
              'risk.followup.logged'
            ]
          }
        }
      })
    ]);

    expect(risk?.severity).toBe('CRITICAL');
    expect(mitigation?.status).toBe('OPEN');
    expect(followup?.status).toBe('OPEN');
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: any) => String(row.title).startsWith('risk.'))).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('risk.register.created')).toBe(true);
    expect(eventTypes.has('risk.assessment.recorded')).toBe(true);
    expect(eventTypes.has('risk.mitigation.created')).toBe(true);
    expect(eventTypes.has('risk.mitigation.overdue')).toBe(true);
    expect(eventTypes.has('risk.followup.logged')).toBe(true);
  });
});
