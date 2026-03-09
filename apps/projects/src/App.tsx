import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type ProjectRow = {
  id: number;
  code: string;
  nameAr: string;
  status?: string | null;
  budget?: number | string | null;
  actualCost?: number | string | null;
};

type PhaseRow = {
  id: number;
  code?: string | null;
  nameAr: string;
  status?: string | null;
  budget?: number | string | null;
  actualCost?: number | string | null;
};

type ExpenseRow = {
  id: number;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  amount?: number | string | null;
};

type CostSummary = {
  project: {
    id: number;
    code: string;
    nameAr: string;
    status?: string | null;
  };
  summary: {
    baselineBudget: number;
    approvedBudget: number;
    committedBudget: number;
    actualBudget: number;
    approvedChangeOrders: number;
    totalBudgetWithChanges: number;
    actualCost: number;
    budgetVariance: number;
    tasks: {
      total: number;
      completed: number;
      inProgress: number;
    };
  };
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

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const [projectForm, setProjectForm] = useState({
    code: '',
    nameAr: '',
    budget: ''
  });
  const [phaseForm, setPhaseForm] = useState({
    nameAr: '',
    budget: ''
  });
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'DIRECT',
    description: '',
    amount: ''
  });

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<ProjectRow[]>('/projects?limit=50');
      setProjects(res.data);
      setSelectedProjectId((current) => current ?? res.data[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function loadProjectDetails(projectId: number) {
    setError(null);
    try {
      const [summaryRes, phasesRes, expensesRes] = await Promise.all([
        getJson<CostSummary>(`/projects/${projectId}/cost-summary`),
        getJson<PhaseRow[]>(`/projects/${projectId}/phases`),
        getJson<ExpenseRow[]>(`/projects/${projectId}/expenses?limit=50`)
      ]);
      setSummary(summaryRes.data);
      setPhases(phasesRes.data);
      setExpenses(expensesRes.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load project details');
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setSummary(null);
      setPhases([]);
      setExpenses([]);
      return;
    }
    void loadProjectDetails(selectedProjectId);
  }, [selectedProjectId]);

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

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-project');
    setMessage(null);
    setError(null);
    try {
      const payloadCode = projectForm.code.trim() || `PRJ-${Date.now().toString().slice(-8)}`;
      const created = await postJson<ProjectRow>('/projects', {
        code: payloadCode,
        nameAr: projectForm.nameAr.trim(),
        status: 'PLANNED',
        budget: projectForm.budget ? Number(projectForm.budget) : undefined
      });
      setProjectForm({ code: '', nameAr: '', budget: '' });
      setSelectedProjectId(created.data.id);
      setMessage('Project created');
      await loadProjects();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create project');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreatePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setSubmitting('create-phase');
    setMessage(null);
    setError(null);
    try {
      await postJson<PhaseRow>(`/projects/${selectedProjectId}/phases`, {
        nameAr: phaseForm.nameAr.trim(),
        budget: phaseForm.budget ? Number(phaseForm.budget) : undefined,
        status: 'PLANNED'
      });
      setPhaseForm({ nameAr: '', budget: '' });
      setMessage('Project phase created');
      await loadProjectDetails(selectedProjectId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create phase');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setSubmitting('create-expense');
    setMessage(null);
    setError(null);
    try {
      await postJson<ExpenseRow>(`/projects/${selectedProjectId}/expenses`, {
        date: expenseForm.date,
        category: expenseForm.category,
        description: expenseForm.description || undefined,
        amount: Number(expenseForm.amount)
      });
      setExpenseForm({
        date: new Date().toISOString().slice(0, 10),
        category: 'DIRECT',
        description: '',
        amount: ''
      });
      setMessage('Project expense recorded');
      await loadProjectDetails(selectedProjectId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create expense');
    } finally {
      setSubmitting(null);
    }
  }

  async function recalculateProjectCosts() {
    if (!selectedProjectId) return;
    setSubmitting('recalculate');
    setMessage(null);
    setError(null);
    try {
      await postJson(`/projects/${selectedProjectId}/recalculate-costs`, {});
      setMessage('Project actual costs recalculated');
      await loadProjectDetails(selectedProjectId);
      await loadProjects();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to recalculate project costs');
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
          <button type="button" className="ui-link" onClick={() => void loadProjects()}>
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
      <SectionCard title={pickLocalized(locale, 'Projects Overview', 'Projects Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Projects', 'Projects')}</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Current Budget', 'Current Budget')}</span>
            <strong>{money(summary?.summary.totalBudgetWithChanges ?? 0)} KWD</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Actual Cost', 'Actual Cost')}</span>
            <strong>{money(summary?.summary.actualCost ?? 0)} KWD</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Variance', 'Variance')}</span>
            <strong>{money(summary?.summary.budgetVariance ?? 0)} KWD</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading projects...', 'Loading projects...')}</div> : null}

      <SectionCard
        title={pickLocalized(locale, 'Project Register', 'Project Register')}
        eyebrow="Projects"
        actions={
          selectedProjectId ? (
            <button type="button" className="ui-button" onClick={() => void recalculateProjectCosts()} disabled={submitting === 'recalculate'}>
              {submitting === 'recalculate'
                ? pickLocalized(locale, 'Recalculating...', 'Recalculating...')
                : pickLocalized(locale, 'Recalculate Costs', 'Recalculate Costs')}
            </button>
          ) : null
        }
      >
        <div className="ui-list">
          {projects.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{row.code + ' - ' + row.nameAr}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'PLANNED') + ' | Budget ' + money(row.budget) + ' KWD | Actual ' + money(row.actualCost) + ' KWD'}
                </p>
              </div>
              <button type="button" className="ui-link" onClick={() => setSelectedProjectId(row.id)}>
                {row.id === selectedProjectId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Create Project', 'Create Project')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateProject}>
          <label>
            <span>{pickLocalized(locale, 'Code', 'Code')}</span>
            <input value={projectForm.code} onChange={(event) => setProjectForm((current) => ({ ...current, code: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Name (AR)', 'Name (AR)')}</span>
            <input required value={projectForm.nameAr} onChange={(event) => setProjectForm((current) => ({ ...current, nameAr: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Budget', 'Budget')}</span>
            <input type="number" step="0.001" value={projectForm.budget} onChange={(event) => setProjectForm((current) => ({ ...current, budget: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-project'}>
            {submitting === 'create-project' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Project', 'Create Project')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Project Phases', 'Project Phases')} eyebrow="Phases">
        {selectedProjectId ? (
          <form className="ui-form" onSubmit={handleCreatePhase}>
            <label>
              <span>{pickLocalized(locale, 'Phase Name', 'Phase Name')}</span>
              <input required value={phaseForm.nameAr} onChange={(event) => setPhaseForm((current) => ({ ...current, nameAr: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'Phase Budget', 'Phase Budget')}</span>
              <input type="number" step="0.001" value={phaseForm.budget} onChange={(event) => setPhaseForm((current) => ({ ...current, budget: event.target.value }))} />
            </label>
            <button type="submit" className="ui-button" disabled={submitting === 'create-phase'}>
              {submitting === 'create-phase' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Add Phase', 'Add Phase')}
            </button>
          </form>
        ) : (
          <p className="ui-muted">{pickLocalized(locale, 'Select a project first', 'Select a project first')}</p>
        )}
        <div className="ui-list">
          {phases.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{(row.code ?? `PH-${row.id}`) + ' - ' + row.nameAr}</strong>
                <p className="ui-muted">{(row.status ?? 'PLANNED') + ' | ' + money(row.budget) + ' KWD | Actual ' + money(row.actualCost) + ' KWD'}</p>
              </div>
            </div>
          ))}
          {!phases.length ? <p className="ui-muted">{pickLocalized(locale, 'No phases yet', 'No phases yet')}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Project Expenses', 'Project Expenses')} eyebrow="Expenses">
        {selectedProjectId ? (
          <form className="ui-form" onSubmit={handleCreateExpense}>
            <label>
              <span>{pickLocalized(locale, 'Date', 'Date')}</span>
              <input type="date" required value={expenseForm.date} onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'Category', 'Category')}</span>
              <input value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'Description', 'Description')}</span>
              <input value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'Amount', 'Amount')}</span>
              <input
                type="number"
                step="0.001"
                required
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </label>
            <button type="submit" className="ui-button" disabled={submitting === 'create-expense'}>
              {submitting === 'create-expense' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Record Expense', 'Record Expense')}
            </button>
          </form>
        ) : (
          <p className="ui-muted">{pickLocalized(locale, 'Select a project first', 'Select a project first')}</p>
        )}
        <div className="ui-list">
          {expenses.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{(row.category ?? 'DIRECT') + ' - ' + money(row.amount) + ' KWD'}</strong>
                <p className="ui-muted">
                  {shortDate(row.date)} | {row.description ?? '-'}
                </p>
              </div>
            </div>
          ))}
          {!expenses.length ? <p className="ui-muted">{pickLocalized(locale, 'No expenses yet', 'No expenses yet')}</p> : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
