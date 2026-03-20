import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPeriodRange(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1))
  };
}

export async function listTimesheets(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.employeeId) where.employeeId = Number(query.employeeId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status);
  if (query.unallocated === 'true') where.projectExpenseId = null;
  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.date.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  }

  const [rows, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      skip,
      take: limit,
      include: {
        employee: { select: { id: true, code: true, fullName: true } },
        project: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.timesheet.count({ where })
  ]);

  return {
    rows,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function getTimesheet(id: number) {
  const row = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, code: true, fullName: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      projectExpense: true
    }
  });
  if (!row) throw Errors.notFound('سجل الدوام/الوقت غير موجود');
  return row;
}

export async function createTimesheet(data: any, userId: number) {
  const employee = await prisma.employee.findUnique({ where: { id: Number(data.employeeId) } });
  if (!employee) throw Errors.notFound('الموظف غير موجود');
  if (String(employee.status).toUpperCase() !== 'ACTIVE') throw Errors.business('لا يمكن تسجيل وقت لموظف غير نشط');

  const project = await prisma.project.findUnique({ where: { id: Number(data.projectId) } });
  if (!project) throw Errors.notFound('المشروع غير موجود');
  if (!project.isActive) throw Errors.business('لا يمكن تسجيل وقت على مشروع غير نشط');

  const hours = roundAmount(Number(data.hours));
  const hourlyCost = roundAmount(Number(data.hourlyCost));
  if (hours <= 0) throw Errors.validation('عدد الساعات يجب أن يكون أكبر من صفر');
  if (hourlyCost < 0) throw Errors.validation('تكلفة الساعة يجب ألا تكون سالبة');

  const branchId = Number(data.branchId ?? employee.branchId ?? project.branchId ?? 0) || null;
  const amount = data.amount !== undefined ? roundAmount(Number(data.amount)) : roundAmount(hours * hourlyCost);
  if (amount < 0) throw Errors.validation('قيمة التكلفة غير صالحة');

  return prisma.$transaction(async (tx) => {
    const timesheet = await tx.timesheet.create({
      data: {
        employeeId: employee.id,
        projectId: project.id,
        branchId,
        date: parseDateOrThrow(data.date),
        hours,
        hourlyCost,
        amount,
        description: data.description
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'hr.timesheet.created',
      aggregateType: 'Timesheet',
      aggregateId: String(timesheet.id),
      actorId: userId,
      branchId,
      correlationId: `timesheet:${timesheet.id}:created`,
      payload: {
        timesheetId: timesheet.id,
        employeeId: timesheet.employeeId,
        projectId: timesheet.projectId,
        hours: timesheet.hours,
        amount: timesheet.amount
      }
    });

    return timesheet;
  });
}

export async function approveTimesheet(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.timesheet.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الدوام/الوقت غير موجود');
    if (current.status === 'APPROVED') return current;

    const updated = await tx.timesheet.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date()
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'hr.timesheet.approved',
      aggregateType: 'Timesheet',
      aggregateId: String(updated.id),
      actorId: userId,
      branchId: updated.branchId,
      correlationId: `timesheet:${updated.id}:approved`,
      payload: {
        timesheetId: updated.id,
        employeeId: updated.employeeId,
        projectId: updated.projectId,
        amount: updated.amount
      }
    });

    return updated;
  });
}

export async function distributePayrollToProjects(payrollRunId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: { lines: true }
    });
    if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
    if (!['APPROVED', 'POSTED', 'PAID'].includes(String(run.status).toUpperCase())) {
      throw Errors.business('يجب اعتماد كشف الرواتب قبل توزيعه على المشاريع');
    }
    if (!run.lines.length) throw Errors.business('كشف الرواتب لا يحتوي على موظفين');

    const eligibleEmployees = Array.from(new Set(run.lines.map((line) => Number(line.employeeId)).filter(Boolean)));
    const approvedTimesheets = await tx.timesheet.findMany({
      where: {
        employeeId: { in: eligibleEmployees },
        status: 'APPROVED',
        date: buildPeriodRange(run.year, run.month),
        ...(run.branchId ? { branchId: run.branchId } : {})
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        project: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    const pendingDistribution = approvedTimesheets.filter((timesheet) => !timesheet.projectExpenseId);
    if (!pendingDistribution.length) {
      return {
        payrollRunId: run.id,
        branchId: run.branchId,
        distributedTimesheets: 0,
        alreadyDistributed: approvedTimesheets.length,
        totalAmount: 0,
        expenseIds: []
      };
    }

    const expenseIds: number[] = [];
    let totalAmount = 0;

    for (const timesheet of pendingDistribution) {
      const amount = roundAmount(Number(timesheet.amount));
      const expense = await tx.projectExpense.create({
        data: {
          projectId: timesheet.projectId,
          date: timesheet.date,
          category: 'LABOR',
          description: timesheet.description ?? `تحميل رواتب الموظف ${timesheet.employee.fullName}`,
          amount,
          reference: `PAYROLL-RUN-${run.id}-TS-${timesheet.id}`
        }
      });

      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          projectExpenseId: expense.id
        }
      });

      await tx.project.update({
        where: { id: timesheet.projectId },
        data: {
          actualCost: {
            increment: amount
          }
        }
      });

      expenseIds.push(expense.id);
      totalAmount = roundAmount(totalAmount + amount);
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'hr.payroll.distributed',
      aggregateType: 'PayrollRun',
      aggregateId: String(run.id),
      actorId: userId,
      branchId: run.branchId,
      correlationId: `payroll:${run.id}:distributed`,
      payload: {
        payrollRunId: run.id,
        distributedTimesheets: pendingDistribution.length,
        alreadyDistributed: approvedTimesheets.length - pendingDistribution.length,
        totalAmount,
        expenseIds
      }
    });

    return {
      payrollRunId: run.id,
      branchId: run.branchId,
      distributedTimesheets: pendingDistribution.length,
      alreadyDistributed: approvedTimesheets.length - pendingDistribution.length,
      totalAmount,
      expenseIds
    };
  });
}
