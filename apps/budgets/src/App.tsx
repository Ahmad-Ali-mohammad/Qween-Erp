import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type AccountRow = {
  id: number;
  code: string;
  nameAr: string;
};

type BudgetLineRow = {
  id: number;
  budgetId: number;
  accountId: number;
  period: number;
  amount: number | string;
  actual?: number | string | null;
  committed?: number | string | null;
  variance?: number | string | null;
  account?: AccountRow | null;
};

type BudgetRow = {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  fiscalYear: number;
  version?: string | null;
  status: string;
  controlLevel?: string | null;
  totalAmount?: number | string | null;
  lines?: BudgetLineRow[];
};

type BudgetState = {
  budgets: BudgetRow[];
  accounts: AccountRow[];
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [data, setData] = useState<BudgetState | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [budgetForm, setBudgetForm] = useState({
    code: '',
    nameAr: '',
    fiscalYear: String(new Date().getFullYear()),
    version: 'v1',
    status: 'DRAFT',
    controlLevel: 'WARNING',
    totalAmount: ''
  });
  const [lineForm, setLineForm] = useState({
    budgetId: '',
    accountId: '',
    period: '1',
    amount: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [budgets, accounts] = await Promise.all([
        getJson<BudgetRow[]>('/budgets'),
        getJson<AccountRow[]>('/accounts?limit=100')
      ]);

      setData({
        budgets: budgets.data,
        accounts: accounts.data
      });

      if (!selectedBudgetId && budgets.data[0]) {
        setSelectedBudgetId(budgets.data[0].id);
        setLineForm((current) => ({ ...current, budgetId: String(budgets.data[0].id) }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل الموازنات', 'Failed to load budgets'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleLocale() {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    setLocale(nextLocale);
    setLocaleState(nextLocale);
  }

  function logout() {
    clearSession();
    setSessionState(null);
    window.location.href = '/portal';
  }

  async function handleCreateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('budget');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<BudgetRow>('/budgets', {
        code: budgetForm.code,
        nameAr: budgetForm.nameAr,
        fiscalYear: Number(budgetForm.fiscalYear),
        version: budgetForm.version || undefined,
        status: budgetForm.status,
        controlLevel: budgetForm.controlLevel,
        totalAmount: budgetForm.totalAmount ? Number(budgetForm.totalAmount) : undefined
      });

      setSelectedBudgetId(response.data.id);
      setLineForm((current) => ({ ...current, budgetId: String(response.data.id) }));
      setBudgetForm({
        code: '',
        nameAr: '',
        fiscalYear: String(new Date().getFullYear()),
        version: 'v1',
        status: 'DRAFT',
        controlLevel: 'WARNING',
        totalAmount: ''
      });
      setMessage(pickLocalized(locale, 'تم إنشاء الموازنة بنجاح', 'Budget created successfully'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إنشاء الموازنة', 'Failed to create budget'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('line');
    setMessage(null);
    setError(null);

    try {
      await postJson<BudgetLineRow>('/budgets/lines', {
        budgetId: Number(lineForm.budgetId),
        accountId: Number(lineForm.accountId),
        period: Number(lineForm.period),
        amount: Number(lineForm.amount)
      });

      setLineForm((current) => ({
        ...current,
        accountId: '',
        period: '1',
        amount: ''
      }));
      setMessage(pickLocalized(locale, 'تمت إضافة بند الموازنة', 'Budget line added successfully'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إضافة بند الموازنة', 'Failed to add budget line'));
    } finally {
      setSubmitting(null);
    }
  }

  const selectedBudget = data?.budgets.find((budget) => budget.id === selectedBudgetId) ?? null;

  if (!system) {
    return null;
  }

  return (
    <AppShell
      locale={locale}
      title={locale === 'ar' ? system.titleAr : system.titleEn}
      subtitle={locale === 'ar' ? system.descriptionAr : system.descriptionEn}
      breadcrumbs={<span className="ui-muted">{system.routeBase}</span>}
      actions={
        <div className="ui-actions">
          <a className="ui-link" href="/portal">
            {pickLocalized(locale, 'العودة إلى البوابة', 'Back to Portal')}
          </a>
          <button type="button" className="ui-link" onClick={toggleLocale}>
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          {session?.token ? (
            <button type="button" className="ui-button" onClick={logout}>
              {pickLocalized(locale, 'تسجيل الخروج', 'Logout')}
            </button>
          ) : null}
        </div>
      }
    >
      <section className="dashboard-grid">
        <article className="metric-card">
          <span>{pickLocalized(locale, 'عدد الموازنات', 'Budgets')}</span>
          <strong>{data?.budgets.length ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي البنود', 'Budget Lines')}</span>
          <strong>{data?.budgets.reduce((sum, budget) => sum + (budget.lines?.length ?? 0), 0) ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي القيمة', 'Total Budget Value')}</span>
          <strong>{money(data?.budgets.reduce((sum, budget) => sum + Number(budget.totalAmount ?? 0), 0))} KWD</strong>
        </article>
      </section>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جاري تحميل الموازنات...', 'Loading budgets...')}</div> : null}

      <section className="surface split-surface">
        <form className="form-card" onSubmit={handleCreateBudget}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Budget</p>
              <h2>{pickLocalized(locale, 'إنشاء موازنة', 'Create Budget')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'الكود', 'Code')}</span>
              <input required value={budgetForm.code} onChange={(event) => setBudgetForm((current) => ({ ...current, code: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'الاسم', 'Name')}</span>
              <input required value={budgetForm.nameAr} onChange={(event) => setBudgetForm((current) => ({ ...current, nameAr: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'السنة المالية', 'Fiscal Year')}</span>
              <input type="number" required value={budgetForm.fiscalYear} onChange={(event) => setBudgetForm((current) => ({ ...current, fiscalYear: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'الإصدار', 'Version')}</span>
              <input value={budgetForm.version} onChange={(event) => setBudgetForm((current) => ({ ...current, version: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
              <select value={budgetForm.status} onChange={(event) => setBudgetForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'مستوى التحكم', 'Control Level')}</span>
              <select value={budgetForm.controlLevel} onChange={(event) => setBudgetForm((current) => ({ ...current, controlLevel: event.target.value }))}>
                <option value="NONE">NONE</option>
                <option value="WARNING">WARNING</option>
                <option value="HARD">HARD</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'إجمالي القيمة', 'Total Amount')}</span>
              <input type="number" step="0.001" value={budgetForm.totalAmount} onChange={(event) => setBudgetForm((current) => ({ ...current, totalAmount: event.target.value }))} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'budget'}>
            {submitting === 'budget' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء الموازنة', 'Create Budget')}
          </button>
        </form>

        <form className="form-card" onSubmit={handleCreateLine}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Budget Lines</p>
              <h2>{pickLocalized(locale, 'إضافة بند', 'Add Budget Line')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'الموازنة', 'Budget')}</span>
              <select required value={lineForm.budgetId} onChange={(event) => setLineForm((current) => ({ ...current, budgetId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر موازنة', 'Select budget')}</option>
                {data?.budgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.code} - {budget.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الحساب', 'Account')}</span>
              <select required value={lineForm.accountId} onChange={(event) => setLineForm((current) => ({ ...current, accountId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر حساباً', 'Select account')}</option>
                {data?.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الفترة', 'Period')}</span>
              <input type="number" min="1" max="12" required value={lineForm.period} onChange={(event) => setLineForm((current) => ({ ...current, period: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'المبلغ', 'Amount')}</span>
              <input type="number" step="0.001" required value={lineForm.amount} onChange={(event) => setLineForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'line'}>
            {submitting === 'line' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إضافة البند', 'Add Line')}
          </button>
        </form>
      </section>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Budget Register</p>
              <h2>{pickLocalized(locale, 'سجل الموازنات', 'Budget Register')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {data?.budgets.map((budget) => (
              <article key={budget.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {budget.code} - {budget.nameAr}
                  </strong>
                  <span className="status-pill">{budget.status}</span>
                </div>
                <span className="muted">
                  {pickLocalized(locale, 'السنة', 'Year')}: {budget.fiscalYear}
                </span>
                <span>
                  {pickLocalized(locale, 'القيمة', 'Value')}: {money(budget.totalAmount)} KWD
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setSelectedBudgetId(budget.id);
                    setLineForm((current) => ({ ...current, budgetId: String(budget.id) }));
                  }}
                >
                  {pickLocalized(locale, 'عرض التفاصيل', 'View Details')}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Details</p>
              <h2>{pickLocalized(locale, 'تفاصيل الموازنة', 'Budget Details')}</h2>
            </div>
          </div>

          {selectedBudget ? (
            <div className="list-grid">
              <article className="list-card">
                <div className="list-card-head">
                  <strong>
                    {selectedBudget.code} - {selectedBudget.nameAr}
                  </strong>
                  <span className="status-pill">{selectedBudget.controlLevel || 'N/A'}</span>
                </div>
                <span className="muted">
                  {pickLocalized(locale, 'عدد البنود', 'Lines')}: {selectedBudget.lines?.length ?? 0}
                </span>
                <span>
                  {pickLocalized(locale, 'إجمالي القيمة', 'Total Amount')}: {money(selectedBudget.totalAmount)} KWD
                </span>
              </article>

              {(selectedBudget.lines ?? []).map((line) => (
                <article key={line.id} className="list-card">
                  <div className="list-card-head">
                    <strong>
                      {line.account?.code || line.accountId} - {line.account?.nameAr || pickLocalized(locale, 'حساب', 'Account')}
                    </strong>
                    <span className="status-pill">{pickLocalized(locale, 'فترة', 'Period')} {line.period}</span>
                  </div>
                  <span>{pickLocalized(locale, 'المبلغ', 'Amount')}: {money(line.amount)} KWD</span>
                  <span className="muted">
                    {pickLocalized(locale, 'فعلي', 'Actual')}: {money(line.actual)} | {pickLocalized(locale, 'التزام', 'Committed')}: {money(line.committed)}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">{pickLocalized(locale, 'لا توجد موازنة محددة', 'No selected budget')}</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
