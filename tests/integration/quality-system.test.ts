import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Quality system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let employeeId = 0;
  let inspectionId = 0;
  let permitId = 0;
  let ncrId = 0;
  let incidentId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (incidentId) await prisma.safetyIncident.deleteMany({ where: { id: incidentId } });
    if (ncrId) await prisma.ncrReport.deleteMany({ where: { id: ncrId } });
    if (permitId) await prisma.permitToWork.deleteMany({ where: { id: permitId } });
    if (inspectionId) await prisma.inspection.deleteMany({ where: { id: inspectionId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs inspection, permit, ncr, and incident flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع الجودة'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع الجودة',
          branchId,
          budget: 120000
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'مفتش جودة',
          branchId,
          status: 'ACTIVE',
          baseSalary: 2000
        }
      })
    ).id;

    const inspectionCreate = await request(app).post('/api/quality/inspections').set(auth()).send({
      projectId,
      inspectorEmployeeId: employeeId,
      inspectionDate: '2026-03-20',
      result: 'FAIL',
      severity: 'HIGH',
      title: 'فحص خرسانة أولي',
      location: 'المنطقة A'
    });
    expect(inspectionCreate.status).toBe(201);
    inspectionId = Number(inspectionCreate.body.data.id);

    const inspectionSubmit = await request(app).post(`/api/quality/inspections/${inspectionId}/submit`).set(auth()).send({});
    expect(inspectionSubmit.status).toBe(200);
    expect(inspectionSubmit.body.data.approvalStatus).toBe('PENDING');

    const inspectionApprove = await request(app).post(`/api/quality/inspections/${inspectionId}/approve`).set(auth()).send({});
    expect(inspectionApprove.status).toBe(200);
    expect(inspectionApprove.body.data.approvalStatus).toBe('APPROVED');

    const permitCreate = await request(app).post('/api/quality/permits').set(auth()).send({
      projectId,
      permitType: 'HOT_WORK',
      issuerEmployeeId: employeeId,
      approverEmployeeId: employeeId,
      validFrom: '2026-03-20',
      validTo: '2026-03-25',
      title: 'تصريح أعمال ساخنة'
    });
    expect(permitCreate.status).toBe(201);
    permitId = Number(permitCreate.body.data.id);

    const permitApprove = await request(app).post(`/api/quality/permits/${permitId}/approve`).set(auth()).send({});
    expect(permitApprove.status).toBe(200);
    expect(permitApprove.body.data.approvalStatus).toBe('APPROVED');

    const ncrCreate = await request(app).post('/api/quality/ncr').set(auth()).send({
      projectId,
      inspectionId,
      reportDate: '2026-03-20',
      severity: 'HIGH',
      title: 'عدم مطابقة في التسليح',
      description: 'التسليح لا يطابق المخطط',
      correctiveAction: 'إعادة العمل قبل الصب'
    });
    expect(ncrCreate.status).toBe(201);
    ncrId = Number(ncrCreate.body.data.id);

    const incidentCreate = await request(app).post('/api/quality/incidents').set(auth()).send({
      projectId,
      permitId,
      incidentDate: '2026-03-20',
      severity: 'CRITICAL',
      title: 'حادث سلامة في الموقع',
      description: 'سقوط جسم من ارتفاع',
      rootCause: 'غياب منطقة عزل واضحة'
    });
    expect(incidentCreate.status).toBe(201);
    incidentId = Number(incidentCreate.body.data.id);

    const controlAlertsBeforeResolve = await request(app).get('/api/control-center/dashboard/alerts').set(auth());
    expect(controlAlertsBeforeResolve.status).toBe(200);
    expect(controlAlertsBeforeResolve.body.data.some((row: any) => row.key === 'quality-critical')).toBe(true);

    const ncrClose = await request(app).post(`/api/quality/ncr/${ncrId}/close`).set(auth()).send({
      notes: 'تم تنفيذ الإجراء التصحيحي'
    });
    expect(ncrClose.status).toBe(200);
    expect(ncrClose.body.data.status).toBe('CLOSED');

    const incidentResolve = await request(app).post(`/api/quality/incidents/${incidentId}/resolve`).set(auth()).send({
      notes: 'تمت المعالجة وإغلاق الموقع مؤقتًا'
    });
    expect(incidentResolve.status).toBe(200);
    expect(incidentResolve.body.data.status).toBe('RESOLVED');

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const response = await request(app).get(`/api/quality/dashboard/${section}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const [inspection, permit, ncr, incident, activity, events] = await Promise.all([
      prisma.inspection.findUnique({ where: { id: inspectionId } }),
      prisma.permitToWork.findUnique({ where: { id: permitId } }),
      prisma.ncrReport.findUnique({ where: { id: ncrId } }),
      prisma.safetyIncident.findUnique({ where: { id: incidentId } }),
      request(app).get('/api/control-center/dashboard/activity').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'quality.inspection.created',
              'quality.inspection.submitted',
              'quality.inspection.approved',
              'quality.ncr.created',
              'quality.ncr.closed',
              'quality.incident.created',
              'quality.incident.resolved',
              'quality.permit.created',
              'quality.permit.approved'
            ]
          }
        }
      })
    ]);

    expect(inspection?.approvalStatus).toBe('APPROVED');
    expect(permit?.approvalStatus).toBe('APPROVED');
    expect(ncr?.status).toBe('CLOSED');
    expect(incident?.status).toBe('RESOLVED');
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: any) => String(row.title).startsWith('quality.'))).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('quality.inspection.created')).toBe(true);
    expect(eventTypes.has('quality.inspection.submitted')).toBe(true);
    expect(eventTypes.has('quality.inspection.approved')).toBe(true);
    expect(eventTypes.has('quality.ncr.created')).toBe(true);
    expect(eventTypes.has('quality.ncr.closed')).toBe(true);
    expect(eventTypes.has('quality.incident.created')).toBe(true);
    expect(eventTypes.has('quality.incident.resolved')).toBe(true);
    expect(eventTypes.has('quality.permit.created')).toBe(true);
    expect(eventTypes.has('quality.permit.approved')).toBe(true);
  });
});
