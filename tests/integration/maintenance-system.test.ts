import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Maintenance system', () => {
  let token = '';
  let branchId = 0;
  let projectId = 0;
  let employeeId = 0;
  let assetCategoryId = 0;
  let assetId = 0;
  let itemId = 0;
  let warehouseId = 0;
  let planId = 0;
  let orderId = 0;
  let executionId = 0;
  let failureId = 0;
  let orderNumber = '';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (orderNumber) await prisma.stockMovement.deleteMany({ where: { reference: orderNumber } });
    if (failureId) await prisma.failureAnalysis.deleteMany({ where: { id: failureId } });
    if (executionId) await prisma.maintenanceExecution.deleteMany({ where: { id: executionId } });
    if (orderId) await prisma.spareReservation.deleteMany({ where: { orderId } });
    if (orderId) await prisma.maintenanceOrder.deleteMany({ where: { id: orderId } });
    if (planId) await prisma.maintenancePlan.deleteMany({ where: { id: planId } });
    if (assetId) await prisma.fixedAsset.deleteMany({ where: { id: assetId } });
    if (assetCategoryId) await prisma.assetCategory.deleteMany({ where: { id: assetCategoryId } });
    if (itemId) await prisma.item.deleteMany({ where: { id: itemId } });
    if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs plan, order, execution, failure, and completion flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع الصيانة'
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع الصيانة',
          branchId,
          budget: 80000
        }
      })
    ).id;

    employeeId = (
      await prisma.employee.create({
        data: {
          code: uniqueCode('EMP'),
          fullName: 'فني صيانة',
          branchId,
          status: 'ACTIVE',
          baseSalary: 2200
        }
      })
    ).id;

    assetCategoryId = (
      await prisma.assetCategory.create({
        data: {
          code: uniqueCode('CAT'),
          nameAr: 'معدات تشغيل',
          usefulLifeMonths: 60
        }
      })
    ).id;

    assetId = (
      await prisma.fixedAsset.create({
        data: {
          code: uniqueCode('AST'),
          nameAr: 'حفار مشروع',
          branchId,
          categoryId: assetCategoryId,
          purchaseCost: 100000,
          netBookValue: 100000
        }
      })
    ).id;

    itemId = (
      await prisma.item.create({
        data: {
          code: uniqueCode('ITM'),
          nameAr: 'فلتر زيت',
          purchasePrice: 20,
          onHandQty: 20,
          inventoryValue: 400
        }
      })
    ).id;

    warehouseId = (
      await prisma.warehouse.create({
        data: {
          code: uniqueCode('WH'),
          nameAr: 'مستودع الصيانة',
          branchId
        }
      })
    ).id;

    const planCreate = await request(app).post('/api/maintenance/plans').set(auth()).send({
      assetId,
      projectId,
      title: 'خطة صيانة وقائية أسبوعية',
      frequencyType: 'TIME',
      intervalValue: 7,
      nextDueDate: '2026-03-25'
    });
    expect(planCreate.status).toBe(201);
    planId = Number(planCreate.body.data.id);

    const orderCreate = await request(app).post('/api/maintenance/orders').set(auth()).send({
      planId,
      assetId,
      projectId,
      title: 'تنفيذ صيانة وقائية',
      priority: 'HIGH',
      scheduledDate: '2026-03-20',
      dueDate: '2026-03-22',
      estimatedCost: 250
    });
    expect(orderCreate.status).toBe(201);
    orderId = Number(orderCreate.body.data.id);
    orderNumber = String(orderCreate.body.data.number || '');

    const orderSubmit = await request(app).post(`/api/maintenance/orders/${orderId}/submit`).set(auth()).send({});
    expect(orderSubmit.status).toBe(200);
    expect(orderSubmit.body.data.approvalStatus).toBe('PENDING');

    const orderApprove = await request(app).post(`/api/maintenance/orders/${orderId}/approve`).set(auth()).send({});
    expect(orderApprove.status).toBe(200);
    expect(orderApprove.body.data.approvalStatus).toBe('APPROVED');

    const executionCreate = await request(app).post('/api/maintenance/executions').set(auth()).send({
      orderId,
      assetId,
      projectId,
      executionDate: '2026-03-20',
      technicianEmployeeId: employeeId,
      hoursWorked: 4,
      laborCost: 150,
      spareItemId: itemId,
      warehouseId,
      spareQuantity: 3,
      spareCost: 60
    });
    expect(executionCreate.status).toBe(201);
    executionId = Number(executionCreate.body.data.id);

    const failureCreate = await request(app).post('/api/maintenance/failures').set(auth()).send({
      orderId,
      assetId,
      projectId,
      incidentDate: '2026-03-20',
      title: 'عطل متكرر في منظومة التبريد',
      failureMode: 'Cooling Failure',
      rootCause: 'انسداد الفلتر',
      severity: 'CRITICAL',
      mtbfHours: 12
    });
    expect(failureCreate.status).toBe(201);
    failureId = Number(failureCreate.body.data.id);

    const controlAlertsBeforeComplete = await request(app).get('/api/control-center/dashboard/alerts').set(auth());
    expect(controlAlertsBeforeComplete.status).toBe(200);
    expect(controlAlertsBeforeComplete.body.data.some((row: any) => row.key === 'maintenance-critical')).toBe(true);

    const completeOrder = await request(app).post(`/api/maintenance/orders/${orderId}/complete`).set(auth()).send({
      notes: 'اكتمل التنفيذ وعادت المعدة للخدمة'
    });
    expect(completeOrder.status).toBe(200);
    expect(completeOrder.body.data.status).toBe('COMPLETED');

    for (const section of ['summary', 'queues', 'activity', 'alerts', 'charts']) {
      const response = await request(app).get(`/api/maintenance/dashboard/${section}`).set(auth());
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }

    const [order, execution, failure, item, stockMovement, project, activity, events] = await Promise.all([
      prisma.maintenanceOrder.findUnique({ where: { id: orderId } }),
      prisma.maintenanceExecution.findUnique({ where: { id: executionId } }),
      prisma.failureAnalysis.findUnique({ where: { id: failureId } }),
      prisma.item.findUnique({ where: { id: itemId } }),
      prisma.stockMovement.findFirst({ where: { reference: orderNumber } }),
      prisma.project.findUnique({ where: { id: projectId } }),
      request(app).get('/api/control-center/dashboard/activity').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'maintenance.plan.created',
              'maintenance.order.created',
              'maintenance.order.submitted',
              'maintenance.order.approved',
              'maintenance.execution.logged',
              'maintenance.failure.detected',
              'maintenance.order.completed'
            ]
          }
        }
      })
    ]);

    expect(order?.status).toBe('COMPLETED');
    expect(execution).not.toBeNull();
    expect(failure?.severity).toBe('CRITICAL');
    expect(Number(item?.onHandQty)).toBe(17);
    expect(stockMovement?.type).toBe('ISSUE_MAINTENANCE');
    expect(Number(project?.actualCost)).toBe(210);
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: any) => String(row.title).startsWith('maintenance.'))).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('maintenance.plan.created')).toBe(true);
    expect(eventTypes.has('maintenance.order.created')).toBe(true);
    expect(eventTypes.has('maintenance.order.submitted')).toBe(true);
    expect(eventTypes.has('maintenance.order.approved')).toBe(true);
    expect(eventTypes.has('maintenance.execution.logged')).toBe(true);
    expect(eventTypes.has('maintenance.failure.detected')).toBe(true);
    expect(eventTypes.has('maintenance.order.completed')).toBe(true);
  });
});
