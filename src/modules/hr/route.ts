import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess, getScopeIds } from '../../utils/access-scope';
import { Errors, ok } from '../../utils/response';
import * as service from './service';

const router = Router();

const employeeSchema = z
  .object({
    code: z.string().trim().max(60).optional(),
    branchId: z.coerce.number().int().positive().optional(),
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().max(50).optional(),
    department: z.string().trim().max(150).optional(),
    position: z.string().trim().max(150).optional(),
    hireDate: z.string().optional(),
    status: z.string().trim().max(50).optional(),
    baseSalary: z.coerce.number().nonnegative().optional(),
    allowances: z.coerce.number().nonnegative().optional(),
    bankAccountIban: z.string().trim().max(80).optional()
  })
  .strict();

const leaveSchema = z
  .object({
    employeeId: z.coerce.number().int().positive(),
    type: z.string().trim().min(1).max(50),
    startDate: z.string(),
    endDate: z.string(),
    daysCount: z.coerce.number().int().positive().optional(),
    reason: z.string().trim().optional(),
    status: z.string().trim().max(50).optional()
  })
  .strict();

const attendanceSchema = z
  .object({
    employeeId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive().optional(),
    date: z.string(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    hoursWorked: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().max(50).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const timesheetSchema = z
  .object({
    employeeId: z.coerce.number().int().positive(),
    projectId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive().optional(),
    date: z.string(),
    hours: z.coerce.number().positive(),
    hourlyCost: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional()
  })
  .strict();

const payrollGenerateSchema = z
  .object({
    year: z.coerce.number().int().min(2000),
    month: z.coerce.number().int().min(1).max(12),
    branchId: z.coerce.number().int().positive().optional()
  })
  .strict();

const payrollLineSchema = z
  .object({
    basicSalary: z.coerce.number().nonnegative().optional(),
    allowances: z.coerce.number().nonnegative().optional(),
    overtime: z.coerce.number().nonnegative().optional(),
    deductions: z.coerce.number().nonnegative().optional()
  })
  .strict();

const payrollPostSchema = z
  .object({
    postingDate: z.string().optional(),
    description: z.string().trim().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    costCenterId: z.coerce.number().int().positive().optional()
  })
  .strict();

async function assertEmployeeAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, branchId: true }
  });
  if (!employee) throw Errors.notFound('الموظف غير موجود');
  if (employee.branchId) assertBranchScopeAccess(req, employee.branchId, mode);
  return employee;
}

async function assertLeaveAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, employeeId: true }
  });
  if (!leave) throw Errors.notFound('طلب الإجازة غير موجود');
  const employee = await prisma.employee.findUnique({
    where: { id: leave.employeeId },
    select: { branchId: true }
  });
  if (employee?.branchId) assertBranchScopeAccess(req, employee.branchId, mode);
  return leave;
}

async function assertAttendanceAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const attendance = await prisma.attendance.findUnique({
    where: { id },
    select: { id: true, branchId: true, employee: { select: { branchId: true } } }
  });
  if (!attendance) throw Errors.notFound('سجل الحضور غير موجود');
  const branchId = attendance.branchId ?? attendance.employee?.branchId ?? null;
  if (branchId) assertBranchScopeAccess(req, branchId, mode);
  return attendance;
}

async function assertTimesheetAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!timesheet) throw Errors.notFound('سجل الوقت غير موجود');
  if (timesheet.branchId) assertBranchScopeAccess(req, timesheet.branchId, mode);
  if (timesheet.projectId) assertProjectScopeAccess(req, timesheet.projectId, mode);
  return timesheet;
}

async function assertPayrollRunAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { id: true, branchId: true }
  });
  if (!run) throw Errors.notFound('كشف الرواتب غير موجود');

  if (run.branchId) {
    assertBranchScopeAccess(req, run.branchId, mode);
    return run;
  }

  const lineBranches = await prisma.payrollLine.findMany({
    where: { payrollRunId: id, branchId: { not: null } },
    distinct: ['branchId'],
    select: { branchId: true }
  });

  for (const line of lineBranches) {
    if (line.branchId) assertBranchScopeAccess(req, line.branchId, mode);
  }

  return run;
}

async function assertPayrollLineAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const line = await prisma.payrollLine.findUnique({
    where: { id },
    select: { id: true, branchId: true, payrollRunId: true }
  });
  if (!line) throw Errors.notFound('سطر الرواتب غير موجود');

  if (line.branchId) {
    assertBranchScopeAccess(req, line.branchId, mode);
  } else {
    await assertPayrollRunAccess(req, line.payrollRunId, mode);
  }

  return line;
}

router.use(authenticate);

router.get('/employees', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    const data = await service.listEmployees({
      ...req.query,
      branchIds: getScopeIds(req, 'branch')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/employees', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(employeeSchema), audit('employees'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.createEmployee(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/employees/:id', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, Number(req.params.id));
    ok(res, await service.getEmployee(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/employees/:id', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(employeeSchema.partial()), audit('employees'), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, Number(req.params.id), 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.updateEmployee(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/employees/:id', requirePermissions(PERMISSIONS.HR_WRITE), audit('employees'), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteEmployee(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/leaves', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.employeeId) await assertEmployeeAccess(req, Number(req.query.employeeId));
    const data = await service.listLeaves({
      ...req.query,
      branchIds: getScopeIds(req, 'branch')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/leaves', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(leaveSchema), audit('leave_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, req.body.employeeId, 'write');
    ok(res, await service.createLeave(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/leaves/:id', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertLeaveAccess(req, Number(req.params.id));
    ok(res, await service.getLeave(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/leaves/:id', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(leaveSchema.partial()), audit('leave_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertLeaveAccess(req, Number(req.params.id), 'write');
    if (req.body.employeeId) await assertEmployeeAccess(req, req.body.employeeId, 'write');
    ok(res, await service.updateLeave(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/leaves/:id/approve', requirePermissions(PERMISSIONS.HR_WRITE), audit('leave_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertLeaveAccess(req, Number(req.params.id), 'write');
    ok(res, await service.approveLeave(Number(req.params.id), Number(req.user!.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/leaves/:id/reject', requirePermissions(PERMISSIONS.HR_WRITE), audit('leave_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertLeaveAccess(req, Number(req.params.id), 'write');
    ok(res, await service.rejectLeave(Number(req.params.id), Number(req.user!.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/leaves/:id', requirePermissions(PERMISSIONS.HR_WRITE), audit('leave_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertLeaveAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteLeave(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/attendance', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.employeeId) await assertEmployeeAccess(req, Number(req.query.employeeId));
    const data = await service.listAttendance({
      ...req.query,
      branchIds: getScopeIds(req, 'branch')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/attendance', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(attendanceSchema), audit('attendance'), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, req.body.employeeId, 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.createAttendance(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/attendance/:id', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertAttendanceAccess(req, Number(req.params.id));
    ok(res, await service.getAttendance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/attendance/:id', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(attendanceSchema.partial()), audit('attendance'), async (req: AuthRequest, res, next) => {
  try {
    await assertAttendanceAccess(req, Number(req.params.id), 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.updateAttendance(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/attendance/:id', requirePermissions(PERMISSIONS.HR_WRITE), audit('attendance'), async (req: AuthRequest, res, next) => {
  try {
    await assertAttendanceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteAttendance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/timesheets', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    if (req.query.employeeId) await assertEmployeeAccess(req, Number(req.query.employeeId));
    const data = await service.listTimesheets({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/timesheets', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(timesheetSchema), audit('timesheets'), async (req: AuthRequest, res, next) => {
  try {
    await assertEmployeeAccess(req, req.body.employeeId, 'write');
    assertProjectScopeAccess(req, req.body.projectId, 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.createTimesheet(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/timesheets/:id', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertTimesheetAccess(req, Number(req.params.id));
    ok(res, await service.getTimesheet(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/timesheets/:id', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(timesheetSchema.partial()), audit('timesheets'), async (req: AuthRequest, res, next) => {
  try {
    await assertTimesheetAccess(req, Number(req.params.id), 'write');
    if (req.body.projectId) assertProjectScopeAccess(req, req.body.projectId, 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.updateTimesheet(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/timesheets/:id/approve', requirePermissions(PERMISSIONS.HR_WRITE), audit('timesheets'), async (req: AuthRequest, res, next) => {
  try {
    await assertTimesheetAccess(req, Number(req.params.id), 'write');
    ok(res, await service.approveTimesheet(Number(req.params.id), Number(req.user!.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/timesheets/:id', requirePermissions(PERMISSIONS.HR_WRITE), audit('timesheets'), async (req: AuthRequest, res, next) => {
  try {
    await assertTimesheetAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteTimesheet(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/payroll', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    const data = await service.listPayrollRuns({
      ...req.query,
      branchIds: getScopeIds(req, 'branch')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/payroll/generate', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(payrollGenerateSchema), audit('payroll_runs'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    ok(res, await service.generatePayroll(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/payroll/:id', requirePermissions(PERMISSIONS.HR_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollRunAccess(req, Number(req.params.id));
    ok(res, await service.getPayrollRun(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/payroll/lines/:id', requirePermissions(PERMISSIONS.HR_WRITE), validateBody(payrollLineSchema), audit('payroll_lines'), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollLineAccess(req, Number(req.params.id), 'write');
    ok(res, await service.updatePayrollLine(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/payroll/:id/approve', requirePermissions(PERMISSIONS.HR_WRITE), audit('payroll_runs'), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollRunAccess(req, Number(req.params.id), 'write');
    ok(res, await service.approvePayrollRun(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/payroll/:id/post', requirePermissions(PERMISSIONS.HR_WRITE, PERMISSIONS.JOURNAL_POST), validateBody(payrollPostSchema), audit('payroll_runs'), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollRunAccess(req, Number(req.params.id), 'write');
    if (req.body.projectId) assertProjectScopeAccess(req, req.body.projectId, 'write');
    const result = await service.postPayrollRun(Number(req.params.id), Number(req.user!.id), req.body);
    ok(res, result, undefined, 200, {
      postingRefs: result.journalEntryId ? { journalEntryId: result.journalEntryId } : undefined
    });
  } catch (error) {
    next(error);
  }
});

router.post('/payroll/:id/pay', requirePermissions(PERMISSIONS.HR_WRITE), audit('payroll_runs'), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollRunAccess(req, Number(req.params.id), 'write');
    ok(res, await service.payPayrollRun(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/payroll/:id', requirePermissions(PERMISSIONS.HR_WRITE), audit('payroll_runs'), async (req: AuthRequest, res, next) => {
  try {
    await assertPayrollRunAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deletePayrollRun(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
