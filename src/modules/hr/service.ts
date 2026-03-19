import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { createEntry, postEntry } from '../journals/service';
import { reserveNextSequenceInDb } from '../numbering/service';
import { recalculateProjectActualCost } from '../projects/service';
import { resolvePostingAccounts } from '../shared/posting-accounts';

type PaginationResult<T> = {
  rows: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

type HrDb = Prisma.TransactionClient | typeof prisma;

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function calculateLeaveDays(startDate: Date, endDate: Date) {
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) throw Errors.validation('تاريخ نهاية الإجازة يجب أن يكون بعد تاريخ البداية');
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function calculateWorkedHours(checkIn?: Date | null, checkOut?: Date | null) {
  if (!checkIn || !checkOut) return 0;
  const diff = checkOut.getTime() - checkIn.getTime();
  if (diff < 0) throw Errors.validation('وقت الانصراف يجب أن يكون بعد وقت الحضور');
  return roundAmount(diff / (60 * 60 * 1000));
}

function computeNetSalary(line: {
  basicSalary?: number | Prisma.Decimal | null;
  allowances?: number | Prisma.Decimal | null;
  overtime?: number | Prisma.Decimal | null;
  deductions?: number | Prisma.Decimal | null;
}) {
  const basicSalary = Number(line.basicSalary ?? 0);
  const allowances = Number(line.allowances ?? 0);
  const overtime = Number(line.overtime ?? 0);
  const deductions = Number(line.deductions ?? 0);
  return roundAmount(basicSalary + allowances + overtime - deductions);
}

async function ensureBranchExists(tx: HrDb, branchId?: number | null) {
  if (!branchId) return;
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
}

async function ensureEmployeeExists(tx: HrDb, employeeId: number) {
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw Errors.validation('الموظف غير موجود');
  return employee;
}

async function ensureProjectExists(tx: HrDb, projectId: number) {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.validation('المشروع غير موجود');
  return project;
}

async function recalculatePayrollRunTotals(tx: HrDb, payrollRunId: number) {
  const lines = await tx.payrollLine.findMany({ where: { payrollRunId } });
  const grossTotal = roundAmount(
    lines.reduce((sum, line) => sum + Number(line.basicSalary) + Number(line.allowances) + Number(line.overtime), 0)
  );
  const deductionTotal = roundAmount(lines.reduce((sum, line) => sum + Number(line.deductions), 0));
  const netTotal = roundAmount(lines.reduce((sum, line) => sum + Number(line.netSalary), 0));

  return tx.payrollRun.update({
    where: { id: payrollRunId },
    data: {
      grossTotal,
      deductionTotal,
      netTotal
    }
  });
}

export async function listEmployees(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const search = String(query.search ?? '').trim();
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];

  const where: Prisma.EmployeeWhereInput = {
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }]
    }),
    prisma.employee.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getEmployee(id: number) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw Errors.notFound('الموظف غير موجود');

  const [leaves, payrollLines] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { employeeId: id }, orderBy: [{ startDate: 'desc' }, { id: 'desc' }], take: 10 }),
    prisma.payrollLine.findMany({ where: { employeeId: id }, orderBy: { id: 'desc' }, take: 12 })
  ]);

  return { ...employee, leaves, payrollLines };
}

export async function createEmployee(data: {
  code?: string;
  branchId?: number;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  status?: string;
  baseSalary?: number;
  allowances?: number;
  bankAccountIban?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureBranchExists(tx, data.branchId);

    const code =
      data.code ??
      (
        await reserveNextSequenceInDb(tx, {
          documentType: 'EMP',
          branchId: data.branchId ?? null,
          date: data.hireDate ?? new Date()
        })
      ).number;

    return tx.employee.create({
      data: {
        code,
        branchId: data.branchId ?? null,
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        department: data.department ?? null,
        position: data.position ?? null,
        hireDate: data.hireDate ? parseDateOrThrow(data.hireDate, 'hireDate') : null,
        status: data.status ?? 'ACTIVE',
        baseSalary: roundAmount(Number(data.baseSalary ?? 0)),
        allowances: roundAmount(Number(data.allowances ?? 0)),
        bankAccountIban: data.bankAccountIban ?? null
      }
    });
  });
}

export async function updateEmployee(
  id: number,
  data: {
    branchId?: number | null;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    position?: string | null;
    hireDate?: string | null;
    status?: string;
    baseSalary?: number;
    allowances?: number;
    bankAccountIban?: string | null;
  }
) {
  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('الموظف غير موجود');

  return prisma.$transaction(async (tx) => {
    await ensureBranchExists(tx, data.branchId === undefined ? current.branchId : data.branchId);

    return tx.employee.update({
      where: { id },
      data: {
        ...('branchId' in data ? { branchId: data.branchId ?? null } : {}),
        ...('fullName' in data ? { fullName: data.fullName } : {}),
        ...('email' in data ? { email: data.email ?? null } : {}),
        ...('phone' in data ? { phone: data.phone ?? null } : {}),
        ...('department' in data ? { department: data.department ?? null } : {}),
        ...('position' in data ? { position: data.position ?? null } : {}),
        ...('hireDate' in data ? { hireDate: data.hireDate ? parseDateOrThrow(data.hireDate, 'hireDate') : null } : {}),
        ...('status' in data ? { status: data.status } : {}),
        ...('baseSalary' in data ? { baseSalary: roundAmount(Number(data.baseSalary ?? 0)) } : {}),
        ...('allowances' in data ? { allowances: roundAmount(Number(data.allowances ?? 0)) } : {}),
        ...('bankAccountIban' in data ? { bankAccountIban: data.bankAccountIban ?? null } : {})
      }
    });
  });
}

export async function deleteEmployee(id: number) {
  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('الموظف غير موجود');

  const [leaveCount, payrollLineCount] = await Promise.all([
    prisma.leaveRequest.count({ where: { employeeId: id } }),
    prisma.payrollLine.count({ where: { employeeId: id } })
  ]);

  if (leaveCount > 0 || payrollLineCount > 0) {
    throw Errors.business('لا يمكن حذف موظف مرتبط بإجازات أو كشوف رواتب');
  }

  await prisma.employee.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listLeaves(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const where: Prisma.LeaveRequestWhereInput = {
    ...(query.employeeId ? { employeeId: Number(query.employeeId) } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.type ? { type: String(query.type) } : {}),
    ...(!query.employeeId && branchIds.length ? { employee: { branchId: { in: branchIds } } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.leaveRequest.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getLeave(id: number) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) throw Errors.notFound('طلب الإجازة غير موجود');
  const employee = await prisma.employee.findUnique({ where: { id: leave.employeeId } });
  return { ...leave, employee };
}

export async function createLeave(data: {
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string;
  daysCount?: number;
  reason?: string;
  status?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureEmployeeExists(tx, data.employeeId);
    const startDate = parseDateOrThrow(data.startDate, 'startDate');
    const endDate = parseDateOrThrow(data.endDate, 'endDate');
    const daysCount = data.daysCount ?? calculateLeaveDays(startDate, endDate);

    return tx.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        type: data.type,
        startDate,
        endDate,
        daysCount,
        reason: data.reason ?? null,
        status: data.status ?? 'PENDING'
      }
    });
  });
}

export async function updateLeave(
  id: number,
  data: {
    employeeId?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
    daysCount?: number;
    reason?: string | null;
    status?: string;
  }
) {
  const current = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الإجازة غير موجود');
  if (current.status !== 'PENDING') throw Errors.business('يمكن تعديل طلب الإجازة المعلق فقط');

  return prisma.$transaction(async (tx) => {
    const employeeId = data.employeeId ?? current.employeeId;
    await ensureEmployeeExists(tx, employeeId);

    const startDate = data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : current.startDate;
    const endDate = data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : current.endDate;
    const daysCount = data.daysCount ?? calculateLeaveDays(startDate, endDate);

    return tx.leaveRequest.update({
      where: { id },
      data: {
        employeeId,
        type: data.type ?? current.type,
        startDate,
        endDate,
        daysCount,
        reason: data.reason === undefined ? current.reason : data.reason,
        status: data.status ?? current.status
      }
    });
  });
}

export async function approveLeave(id: number, userId: number) {
  const current = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الإجازة غير موجود');
  if (current.status !== 'PENDING') throw Errors.business('تمت معالجة طلب الإجازة مسبقاً');

  return prisma.leaveRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date()
    }
  });
}

export async function rejectLeave(id: number, userId: number) {
  const current = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الإجازة غير موجود');
  if (current.status !== 'PENDING') throw Errors.business('تمت معالجة طلب الإجازة مسبقاً');

  return prisma.leaveRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      approvedBy: userId,
      approvedAt: new Date()
    }
  });
}

export async function deleteLeave(id: number) {
  const current = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الإجازة غير موجود');
  await prisma.leaveRequest.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listAttendance(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const where: Prisma.AttendanceWhereInput = {
    ...(query.employeeId ? { employeeId: Number(query.employeeId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      include: {
        employee: true,
        branch: true
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.attendance.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getAttendance(id: number) {
  const row = await prisma.attendance.findUnique({
    where: { id },
    include: {
      employee: true,
      branch: true
    }
  });
  if (!row) throw Errors.notFound('سجل الحضور غير موجود');
  return row;
}

export async function createAttendance(data: {
  employeeId: number;
  branchId?: number;
  date: string;
  checkIn?: string;
  checkOut?: string;
  hoursWorked?: number;
  status?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await ensureEmployeeExists(tx, data.employeeId);
    const branchId = data.branchId ?? employee.branchId ?? null;
    await ensureBranchExists(tx, branchId);

    const date = parseDateOrThrow(data.date, 'date');
    const checkIn = data.checkIn ? parseDateOrThrow(data.checkIn, 'checkIn') : null;
    const checkOut = data.checkOut ? parseDateOrThrow(data.checkOut, 'checkOut') : null;
    const hoursWorked =
      data.hoursWorked === undefined ? calculateWorkedHours(checkIn, checkOut) : roundAmount(Number(data.hoursWorked ?? 0));

    return tx.attendance.create({
      data: {
        employeeId: data.employeeId,
        branchId,
        date,
        checkIn,
        checkOut,
        hoursWorked,
        status: data.status ?? 'PRESENT',
        notes: data.notes ?? null
      }
    });
  });
}

export async function updateAttendance(
  id: number,
  data: {
    branchId?: number | null;
    date?: string;
    checkIn?: string | null;
    checkOut?: string | null;
    hoursWorked?: number;
    status?: string;
    notes?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.attendance.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الحضور غير موجود');

    const branchId = data.branchId === undefined ? current.branchId : data.branchId;
    await ensureBranchExists(tx, branchId);

    const checkIn =
      data.checkIn === undefined ? current.checkIn : data.checkIn ? parseDateOrThrow(data.checkIn, 'checkIn') : null;
    const checkOut =
      data.checkOut === undefined ? current.checkOut : data.checkOut ? parseDateOrThrow(data.checkOut, 'checkOut') : null;
    const calculatedHours = calculateWorkedHours(checkIn, checkOut);
    const hoursWorked =
      data.hoursWorked === undefined
        ? calculatedHours || Number(current.hoursWorked ?? 0)
        : roundAmount(Number(data.hoursWorked ?? 0));

    return tx.attendance.update({
      where: { id },
      data: {
        ...('branchId' in data ? { branchId: branchId ?? null } : {}),
        ...('date' in data ? { date: parseDateOrThrow(data.date!, 'date') } : {}),
        ...('checkIn' in data ? { checkIn } : {}),
        ...('checkOut' in data ? { checkOut } : {}),
        hoursWorked,
        ...('status' in data ? { status: data.status } : {}),
        ...('notes' in data ? { notes: data.notes ?? null } : {})
      }
    });
  });
}

export async function deleteAttendance(id: number) {
  const current = await prisma.attendance.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('سجل الحضور غير موجود');
  await prisma.attendance.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listTimesheets(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const projectIds = Array.isArray((query as any).projectIds) ? ((query as any).projectIds as number[]).map(Number) : [];
  const where: Prisma.TimesheetWhereInput = {
    ...(query.employeeId ? { employeeId: Number(query.employeeId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.projectId && projectIds.length ? { projectId: { in: projectIds } } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      skip,
      take: limit,
      include: {
        employee: true,
        project: true,
        branch: true,
        projectExpense: true
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.timesheet.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getTimesheet(id: number) {
  const row = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      employee: true,
      project: true,
      branch: true,
      projectExpense: true
    }
  });
  if (!row) throw Errors.notFound('سجل الوقت غير موجود');
  return row;
}

export async function createTimesheet(data: {
  employeeId: number;
  projectId: number;
  branchId?: number;
  date: string;
  hours: number;
  hourlyCost?: number;
  description?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await ensureEmployeeExists(tx, data.employeeId);
    await ensureProjectExists(tx, data.projectId);
    const branchId = data.branchId ?? employee.branchId ?? null;
    await ensureBranchExists(tx, branchId);

    const hours = roundAmount(Number(data.hours ?? 0));
    const hourlyCost = roundAmount(
      data.hourlyCost === undefined ? Number(employee.baseSalary ?? 0) / 30 / 8 : Number(data.hourlyCost ?? 0)
    );

    return tx.timesheet.create({
      data: {
        employeeId: data.employeeId,
        projectId: data.projectId,
        branchId,
        date: parseDateOrThrow(data.date, 'date'),
        hours,
        hourlyCost,
        amount: roundAmount(hours * hourlyCost),
        description: data.description ?? null,
        status: 'DRAFT'
      }
    });
  });
}

export async function updateTimesheet(
  id: number,
  data: {
    projectId?: number;
    branchId?: number | null;
    date?: string;
    hours?: number;
    hourlyCost?: number;
    description?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.timesheet.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الوقت غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('يمكن تعديل سجل الوقت في حالة المسودة فقط');

    const projectId = data.projectId ?? current.projectId;
    const branchId = data.branchId === undefined ? current.branchId : data.branchId;
    await ensureProjectExists(tx, projectId);
    await ensureBranchExists(tx, branchId);

    const hours = roundAmount(data.hours === undefined ? Number(current.hours ?? 0) : Number(data.hours ?? 0));
    const hourlyCost = roundAmount(
      data.hourlyCost === undefined ? Number(current.hourlyCost ?? 0) : Number(data.hourlyCost ?? 0)
    );

    return tx.timesheet.update({
      where: { id },
      data: {
        ...('projectId' in data ? { projectId } : {}),
        ...('branchId' in data ? { branchId: branchId ?? null } : {}),
        ...('date' in data ? { date: parseDateOrThrow(data.date!, 'date') } : {}),
        hours,
        hourlyCost,
        amount: roundAmount(hours * hourlyCost),
        ...('description' in data ? { description: data.description ?? null } : {})
      }
    });
  });
}

export async function approveTimesheet(id: number, userId: number) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.timesheet.findUnique({
      where: { id },
      include: {
        employee: true
      }
    });
    if (!current) throw Errors.notFound('سجل الوقت غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('تمت معالجة سجل الوقت مسبقاً');

    let createdExpense: null | {
      id: number;
      projectId: number;
      phaseId: number | null;
      amount: number;
      category: string | null;
      reference: string | null;
    } = null;

    const amount = roundAmount(Number(current.amount ?? 0));
    if (amount > 0) {
      const expense = await tx.projectExpense.create({
        data: {
          projectId: current.projectId,
          date: current.date,
          category: 'LABOR',
          description: `تحميل ساعات عمل الموظف ${current.employee.fullName}`,
          amount,
          reference: `TS-${current.id}`
        }
      });
      await recalculateProjectActualCost(current.projectId, tx);
      createdExpense = {
        id: expense.id,
        projectId: Number(expense.projectId),
        phaseId: expense.phaseId,
        amount: Number(expense.amount),
        category: expense.category,
        reference: expense.reference
      };
    }

    const updated = await tx.timesheet.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        projectExpenseId: createdExpense?.id ?? current.projectExpenseId
      },
      include: {
        employee: true,
        project: true,
        branch: true,
        projectExpense: true
      }
    });

    return { updated, createdExpense };
  });

  if (result.createdExpense) {
    emitAccountingEvent('project.expense.recorded', {
      recordId: result.createdExpense.id,
      projectId: result.createdExpense.projectId,
      phaseId: result.createdExpense.phaseId,
      amount: result.createdExpense.amount,
      category: result.createdExpense.category,
      reference: result.createdExpense.reference
    });
  }

  return result.updated;
}

export async function deleteTimesheet(id: number) {
  const current = await prisma.timesheet.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('سجل الوقت غير موجود');
  if (current.projectExpenseId || current.status !== 'DRAFT') {
    throw Errors.business('لا يمكن حذف سجل وقت معتمد أو مرتبط بتكلفة مشروع');
  }

  await prisma.timesheet.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listPayrollRuns(query: Record<string, unknown>): Promise<PaginationResult<any>> {
  const { page, limit, skip } = paginate(query);
  const branchIds = Array.isArray((query as any).branchIds) ? ((query as any).branchIds as number[]).map(Number) : [];
  const where: Prisma.PayrollRunWhereInput = {
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && branchIds.length ? { branchId: { in: branchIds } } : {}),
    ...(query.year ? { year: Number(query.year) } : {}),
    ...(query.month ? { month: Number(query.month) } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      skip,
      take: limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'desc' }]
    }),
    prisma.payrollRun.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getPayrollRun(id: number) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });
  if (!run) throw Errors.notFound('كشف الرواتب غير موجود');

  const lines = await prisma.payrollLine.findMany({
    where: { payrollRunId: id },
    orderBy: { id: 'asc' }
  });

  const employeeIds = Array.from(new Set(lines.map((line) => line.employeeId)));
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } } })
    : [];
  const employeesMap = new Map(employees.map((employee) => [employee.id, employee]));

  return {
    ...run,
    lines: lines.map((line) => ({
      ...line,
      employee: employeesMap.get(line.employeeId) ?? null
    }))
  };
}

export async function generatePayroll(data: { year: number; month: number; branchId?: number | null }) {
  if (!Number.isInteger(data.year) || data.year < 2000) throw Errors.validation('السنة غير صالحة');
  if (!Number.isInteger(data.month) || data.month < 1 || data.month > 12) throw Errors.validation('الشهر غير صالح');

  return prisma.$transaction(async (tx) => {
    await ensureBranchExists(tx, data.branchId);

    const employees = await tx.employee.findMany({
      where: {
        status: 'ACTIVE',
        ...(data.branchId ? { branchId: data.branchId } : {})
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }]
    });

    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'PAY',
      branchId: data.branchId ?? null,
      date: new Date(Date.UTC(data.year, data.month - 1, 1))
    });

    const lines = employees.map((employee) => ({
      employeeId: employee.id,
      branchId: employee.branchId ?? data.branchId ?? null,
      basicSalary: roundAmount(Number(employee.baseSalary ?? 0)),
      allowances: roundAmount(Number(employee.allowances ?? 0)),
      overtime: 0,
      deductions: 0,
      netSalary: roundAmount(Number(employee.baseSalary ?? 0) + Number(employee.allowances ?? 0))
    }));

    const grossTotal = roundAmount(lines.reduce((sum, line) => sum + line.basicSalary + line.allowances + line.overtime, 0));
    const deductionTotal = roundAmount(lines.reduce((sum, line) => sum + line.deductions, 0));
    const netTotal = roundAmount(lines.reduce((sum, line) => sum + line.netSalary, 0));

    const run = await tx.payrollRun.create({
      data: {
        code: sequence.number,
        branchId: data.branchId ?? null,
        year: data.year,
        month: data.month,
        status: 'DRAFT',
        grossTotal,
        deductionTotal,
        netTotal
      }
    });

    if (lines.length) {
      await tx.payrollLine.createMany({
        data: lines.map((line) => ({
          payrollRunId: run.id,
          ...line
        }))
      });
    }

    return run;
  });
}

export async function updatePayrollLine(
  id: number,
  data: {
    basicSalary?: number;
    allowances?: number;
    overtime?: number;
    deductions?: number;
  }
) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.payrollLine.findUnique({ where: { id } });
    if (!line) throw Errors.notFound('سطر الرواتب غير موجود');

    const run = await tx.payrollRun.findUnique({ where: { id: line.payrollRunId } });
    if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
    if (run.status !== 'DRAFT') throw Errors.business('يمكن تعديل أسطر كشف الرواتب في حالة المسودة فقط');

    const updated = await tx.payrollLine.update({
      where: { id },
      data: {
        ...('basicSalary' in data ? { basicSalary: roundAmount(Number(data.basicSalary ?? 0)) } : {}),
        ...('allowances' in data ? { allowances: roundAmount(Number(data.allowances ?? 0)) } : {}),
        ...('overtime' in data ? { overtime: roundAmount(Number(data.overtime ?? 0)) } : {}),
        ...('deductions' in data ? { deductions: roundAmount(Number(data.deductions ?? 0)) } : {}),
        netSalary: computeNetSalary({
          basicSalary: 'basicSalary' in data ? data.basicSalary : line.basicSalary,
          allowances: 'allowances' in data ? data.allowances : line.allowances,
          overtime: 'overtime' in data ? data.overtime : line.overtime,
          deductions: 'deductions' in data ? data.deductions : line.deductions
        })
      }
    });

    await recalculatePayrollRunTotals(tx, line.payrollRunId);
    return updated;
  });
}

export async function approvePayrollRun(id: number) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
  if (run.status !== 'DRAFT') throw Errors.business('يمكن اعتماد كشف الرواتب في حالة المسودة فقط');

  const lineCount = await prisma.payrollLine.count({ where: { payrollRunId: id } });
  if (!lineCount) throw Errors.business('لا يمكن اعتماد كشف رواتب بدون موظفين');

  return prisma.payrollRun.update({
    where: { id },
    data: { status: 'APPROVED' }
  });
}

export async function postPayrollRun(
  id: number,
  userId: number,
  data?: { postingDate?: string; description?: string; projectId?: number; departmentId?: number; costCenterId?: number }
) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
  if (run.status !== 'APPROVED' && run.status !== 'POSTED' && run.status !== 'PAID') {
    throw Errors.business('يمكن ترحيل كشف الرواتب المعتمد فقط');
  }

  const payrollLines = await prisma.payrollLine.findMany({ where: { payrollRunId: id } });
  if (!payrollLines.length) throw Errors.business('لا يمكن ترحيل كشف رواتب بدون موظفين');

  const netTotal = roundAmount(payrollLines.reduce((sum, line) => sum + Number(line.netSalary ?? 0), 0));
  if (netTotal <= 0) throw Errors.business('صافي كشف الرواتب يجب أن يكون أكبر من صفر');

  const reference = `PAYROLL-RUN-${id}`;
  const existingEntry = await prisma.journalEntry.findFirst({
    where: { reference },
    orderBy: { id: 'desc' }
  });

  if (existingEntry && existingEntry.status !== 'POSTED') {
    throw Errors.business('يوجد قيد رواتب سابق غير مرحل لنفس الكشف');
  }

  let journalEntryId = existingEntry?.id ?? null;
  if (!existingEntry) {
    const postingAccounts = await resolvePostingAccounts(prisma as any);
    const postingDate = data?.postingDate ? parseDateOrThrow(data.postingDate, 'postingDate') : new Date();
    const description =
      data?.description ?? `ترحيل كشف رواتب ${run.year}-${String(run.month).padStart(2, '0')} (${run.code})`;

    const createdEntry = await createEntry(
      {
        date: postingDate.toISOString(),
        description,
        reference,
        source: 'PAYROLL',
        lines: [
          {
            accountId: postingAccounts.purchaseExpenseAccountId,
            debit: netTotal,
            credit: 0,
            projectId: data?.projectId,
            departmentId: data?.departmentId,
            costCenterId: data?.costCenterId,
            description: `مصروف رواتب ${run.code}`
          },
          {
            accountId: postingAccounts.payableAccountId,
            debit: 0,
            credit: netTotal,
            projectId: data?.projectId,
            departmentId: data?.departmentId,
            costCenterId: data?.costCenterId,
            description: `رواتب مستحقة ${run.code}`
          }
        ]
      },
      userId
    );

    const postedEntry = await postEntry(createdEntry.id, userId);
    journalEntryId = postedEntry.id;
  }

  const updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: run.status === 'PAID' ? 'PAID' : 'POSTED',
      runDate: new Date(),
      netTotal
    }
  });

  return {
    ...updated,
    journalEntryId,
    postedAmount: netTotal,
    duplicate: Boolean(existingEntry)
  };
}

export async function payPayrollRun(id: number) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
  if (run.status !== 'POSTED') throw Errors.business('يجب ترحيل كشف الرواتب قبل الدفع');

  return prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'PAID',
      runDate: new Date()
    }
  });
}

export async function deletePayrollRun(id: number) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id } });
    if (!run) throw Errors.notFound('كشف الرواتب غير موجود');
    if (!['DRAFT', 'APPROVED'].includes(String(run.status).toUpperCase())) {
      throw Errors.business('لا يمكن حذف كشف رواتب مرحل أو مدفوع');
    }

    await tx.payrollLine.deleteMany({ where: { payrollRunId: id } });
    await tx.payrollRun.delete({ where: { id } });
    return { deleted: true, id };
  });
}
