import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type EmployeeRow = {
  id: number;
  code?: string | null;
  fullName: string;
  status?: string | null;
  baseSalary?: number | string | null;
  allowances?: number | string | null;
};

type LeaveRow = {
  id: number;
  employeeId: number;
  type: string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type AttendanceRow = {
  id: number;
  employeeId: number;
  date?: string | null;
  status?: string | null;
  hoursWorked?: number | string | null;
};

type TimesheetRow = {
  id: number;
  employeeId: number;
  projectId: number;
  date?: string | null;
  hours?: number | string | null;
  status?: string | null;
};

type PayrollRunRow = {
  id: number;
  year: number;
  month: number;
  status?: string | null;
  totalAmount?: number | string | null;
};

type RowsEnvelope<T> = {
  rows: T[];
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function shortDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.rows ?? [];
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetRow[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRow[]>([]);
  const [selectedLeaveId, setSelectedLeaveId] = useState<number | null>(null);

  const [employeeForm, setEmployeeForm] = useState({
    fullName: '',
    baseSalary: ''
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    type: 'ANNUAL',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10)
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [employeesRes, leavesRes, attendanceRes, timesheetsRes, payrollRes] = await Promise.all([
        getJson<EmployeeRow[] | RowsEnvelope<EmployeeRow>>('/hr/employees?limit=50'),
        getJson<LeaveRow[] | RowsEnvelope<LeaveRow>>('/hr/leaves?limit=50'),
        getJson<AttendanceRow[] | RowsEnvelope<AttendanceRow>>('/hr/attendance?limit=50'),
        getJson<TimesheetRow[] | RowsEnvelope<TimesheetRow>>('/hr/timesheets?limit=50'),
        getJson<PayrollRunRow[] | RowsEnvelope<PayrollRunRow>>('/hr/payroll?limit=20')
      ]);

      const normalizedEmployees = normalizeRows(employeesRes.data);
      const normalizedLeaves = normalizeRows(leavesRes.data);
      setEmployees(normalizedEmployees);
      setLeaves(normalizedLeaves);
      setAttendance(normalizeRows(attendanceRes.data));
      setTimesheets(normalizeRows(timesheetsRes.data));
      setPayrollRuns(normalizeRows(payrollRes.data));
      setSelectedLeaveId((current) => current ?? normalizedLeaves[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load HR data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function toggleLocale() {
    const next = locale === 'ar' ? 'en' : 'ar';
    setLocale(next);
    setLocaleState(next);
  }

  function logout() {
    clearSession();
    setSessionState(null);
    window.location.href = '/portal';
  }

  async function handleCreateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-employee');
    setMessage(null);
    setError(null);
    try {
      await postJson<EmployeeRow>('/hr/employees', {
        fullName: employeeForm.fullName.trim(),
        baseSalary: employeeForm.baseSalary ? Number(employeeForm.baseSalary) : undefined
      });
      setEmployeeForm({ fullName: '', baseSalary: '' });
      setMessage('Employee created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create employee');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-leave');
    setMessage(null);
    setError(null);
    try {
      await postJson<LeaveRow>('/hr/leaves', {
        employeeId: Number(leaveForm.employeeId),
        type: leaveForm.type,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate
      });
      setLeaveForm({
        employeeId: '',
        type: 'ANNUAL',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10)
      });
      setMessage('Leave request created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create leave request');
    } finally {
      setSubmitting(null);
    }
  }

  async function approveLeave(id: number) {
    setSubmitting(`approve-leave-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<LeaveRow>(`/hr/leaves/${id}/approve`, {});
      setMessage('Leave request approved');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to approve leave request');
    } finally {
      setSubmitting(null);
    }
  }

  async function generatePayroll() {
    setSubmitting('generate-payroll');
    setMessage(null);
    setError(null);
    try {
      const now = new Date();
      await postJson<PayrollRunRow>('/hr/payroll/generate', {
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1
      });
      setMessage('Payroll run generated');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to generate payroll');
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) return null;

  return (
    <AppShell
      locale={locale}
      title={locale === 'ar' ? system.titleAr : system.titleEn}
      subtitle={locale === 'ar' ? system.descriptionAr : system.descriptionEn}
      breadcrumbs={<span className="ui-muted">{system.routeBase}</span>}
      actions={
        <div className="ui-actions">
          <a className="ui-link" href="/portal">
            {pickLocalized(locale, 'Back to Portal', 'Back to Portal')}
          </a>
          <button type="button" className="ui-link" onClick={() => void loadData()}>
            {pickLocalized(locale, 'Refresh', 'Refresh')}
          </button>
          <button type="button" className="ui-link" onClick={toggleLocale}>
            {locale === 'ar' ? 'English' : 'Arabic'}
          </button>
          {session?.token ? (
            <button type="button" className="ui-button" onClick={logout}>
              {pickLocalized(locale, 'Logout', 'Logout')}
            </button>
          ) : null}
        </div>
      }
    >
      <SectionCard
        title={pickLocalized(locale, 'HR Overview', 'HR Overview')}
        eyebrow="Overview"
        actions={
          <button type="button" className="ui-button" onClick={() => void generatePayroll()} disabled={submitting === 'generate-payroll'}>
            {submitting === 'generate-payroll' ? pickLocalized(locale, 'Generating...', 'Generating...') : pickLocalized(locale, 'Generate Payroll', 'Generate Payroll')}
          </button>
        }
      >
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Employees', 'Employees')}</span>
            <strong>{employees.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Leave Requests', 'Leave Requests')}</span>
            <strong>{leaves.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Attendance Records', 'Attendance Records')}</span>
            <strong>{attendance.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Payroll Runs', 'Payroll Runs')}</span>
            <strong>{payrollRuns.length}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading HR data...', 'Loading HR data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Employee', 'Create Employee')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateEmployee}>
          <label>
            <span>{pickLocalized(locale, 'Full Name', 'Full Name')}</span>
            <input required value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Base Salary', 'Base Salary')}</span>
            <input type="number" step="0.001" value={employeeForm.baseSalary} onChange={(event) => setEmployeeForm((current) => ({ ...current, baseSalary: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-employee'}>
            {submitting === 'create-employee' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Employee', 'Create Employee')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Leave Requests', 'Leave Requests')} eyebrow="Leaves">
        <form className="ui-form" onSubmit={handleCreateLeave}>
          <label>
            <span>{pickLocalized(locale, 'Employee', 'Employee')}</span>
            <select required value={leaveForm.employeeId} onChange={(event) => setLeaveForm((current) => ({ ...current, employeeId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select employee', 'Select employee')}</option>
              {employees.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `EMP-${row.id}`) + ' - ' + row.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Type', 'Type')}</span>
            <input value={leaveForm.type} onChange={(event) => setLeaveForm((current) => ({ ...current, type: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Start Date', 'Start Date')}</span>
            <input type="date" required value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'End Date', 'End Date')}</span>
            <input type="date" required value={leaveForm.endDate} onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-leave'}>
            {submitting === 'create-leave' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Leave Request', 'Create Leave Request')}
          </button>
        </form>
        <div className="ui-list">
          {leaves.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{row.type + ' - EMP-' + row.employeeId}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'DRAFT') + ' | ' + shortDate(row.startDate) + ' - ' + shortDate(row.endDate)}
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedLeaveId(row.id)}>
                  {selectedLeaveId === row.id ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button type="button" className="ui-button" onClick={() => void approveLeave(row.id)} disabled={submitting === `approve-leave-${row.id}`}>
                  {submitting === `approve-leave-${row.id}` ? pickLocalized(locale, 'Approving...', 'Approving...') : pickLocalized(locale, 'Approve', 'Approve')}
                </button>
              </div>
            </div>
          ))}
          {!leaves.length ? <p className="ui-muted">{pickLocalized(locale, 'No leave requests yet', 'No leave requests yet')}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Attendance / Timesheets / Payroll', 'Attendance / Timesheets / Payroll')} eyebrow="Operations">
        <div className="ui-grid">
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Attendance', 'Attendance')}</p>
            <div className="ui-list">
              {attendance.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{`EMP-${row.employeeId}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'PRESENT') + ' | ' + shortDate(row.date) + ' | ' + money(row.hoursWorked) + 'h'}</p>
                  </div>
                </div>
              ))}
              {!attendance.length ? <p className="ui-muted">{pickLocalized(locale, 'No attendance records', 'No attendance records')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Timesheets', 'Timesheets')}</p>
            <div className="ui-list">
              {timesheets.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{`EMP-${row.employeeId} / PRJ-${row.projectId}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + shortDate(row.date) + ' | ' + money(row.hours) + 'h'}</p>
                  </div>
                </div>
              ))}
              {!timesheets.length ? <p className="ui-muted">{pickLocalized(locale, 'No timesheets', 'No timesheets')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Payroll Runs', 'Payroll Runs')}</p>
            <div className="ui-list">
              {payrollRuns.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{`#${row.id} - ${String(row.month).padStart(2, '0')}/${row.year}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + money(row.totalAmount) + ' KWD'}</p>
                  </div>
                </div>
              ))}
              {!payrollRuns.length ? <p className="ui-muted">{pickLocalized(locale, 'No payroll runs', 'No payroll runs')}</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
