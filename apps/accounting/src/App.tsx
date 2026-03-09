import { useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type Kpis = {
  draftEntries: number;
  pendingInvoices: number;
  pendingPayments: number;
  activeAssets: number;
};

type PeriodRow = {
  id: number;
  number: number;
  name?: string | null;
  status: string;
  canPost: boolean;
  startDate: string;
  endDate: string;
  fiscalYear?: { name?: string | null } | null;
};

type JournalRow = {
  id: number;
  entryNumber: string;
  date: string;
  description?: string | null;
  status: string;
  totalDebit: number | string;
  totalCredit: number | string;
};

type TrialBalance = {
  totals: {
    debit: number;
    credit: number;
    difference: number;
  };
};

type IncomeStatement = {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
};

type BalanceSheet = {
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    balanced: boolean;
  };
};

type CashFlow = {
  operatingInflow: number;
  operatingOutflow: number;
  netCashFlow: number;
};

type AccountingEventRow = {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  error?: string;
};

type AccountRow = {
  id: number;
  code: string;
  nameAr: string;
  type: string;
  allowPosting: boolean;
  isActive: boolean;
};

type MonthCloseCheck = {
  period: {
    id: number;
    number: number;
    name?: string | null;
  };
  checks: {
    draftEntries: number;
    pendingEntries: number;
    unreconciledBankTransactions: number;
    pendingTaxDeclarations: number;
    unbalancedPostedEntries: Array<{ id: number; entryNumber: string }>;
  };
  canClose: boolean;
  issues: string[];
};

type DashboardState = {
  kpis: Kpis;
  periods: PeriodRow[];
  draftJournals: JournalRow[];
  trialBalance: TrialBalance;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlow;
  events: AccountingEventRow[];
  accounts: AccountRow[];
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function shortDate(value: string | Date | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [kpis, periods, journals, trialBalance, incomeStatement, balanceSheet, cashFlow, events, accounts] =
        await Promise.all([
          getJson<Kpis>('/reports/kpis'),
          getJson<PeriodRow[]>('/periods'),
          getJson<JournalRow[]>('/journals?status=DRAFT&limit=8'),
          getJson<TrialBalance>('/reports/trial-balance'),
          getJson<IncomeStatement>('/reports/income-statement'),
          getJson<BalanceSheet>('/reports/balance-sheet'),
          getJson<CashFlow>('/reports/cash-flow'),
          getJson<AccountingEventRow[]>('/accounting/events?limit=8'),
          getJson<AccountRow[]>('/accounts?limit=8')
        ]);

      setDashboard({
        kpis: kpis.data,
        periods: periods.data,
        draftJournals: journals.data,
        trialBalance: trialBalance.data,
        incomeStatement: incomeStatement.data,
        balanceSheet: balanceSheet.data,
        cashFlow: cashFlow.data,
        events: events.data,
        accounts: accounts.data
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل لوحة المحاسبة', 'Failed to load accounting dashboard'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      await action();
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : pickLocalized(locale, 'تعذر تنفيذ العملية', 'Action failed'));
    } finally {
      setBusyKey(null);
    }
  }

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

  async function handlePostJournal(id: number) {
    await runAction(`journal:${id}`, async () => {
      await postJson(`/journals/${id}/post`, {});
      setMessage(pickLocalized(locale, 'تم ترحيل القيد بنجاح', 'Journal posted successfully'));
    });
  }

  async function handleClosePeriod(period: PeriodRow) {
    await runAction(`close:${period.id}`, async () => {
      const validation = await getJson<MonthCloseCheck>(`/accounting/month-close/check/${period.id}`);
      if (!validation.data.canClose) {
        throw new Error(validation.data.issues.join(' | '));
      }

      await postJson('/accounting/month-close', { periodId: period.id });
      setMessage(
        pickLocalized(
          locale,
          `تم إقفال الفترة ${period.name ?? period.number}`,
          `Closed period ${period.name ?? period.number}`
        )
      );
    });
  }

  async function handleReopenPeriod(period: PeriodRow) {
    await runAction(`open:${period.id}`, async () => {
      await postJson(`/periods/${period.id}/open`, {});
      setMessage(
        pickLocalized(
          locale,
          `تمت إعادة فتح الفترة ${period.name ?? period.number}`,
          `Reopened period ${period.name ?? period.number}`
        )
      );
    });
  }

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
          <span>{pickLocalized(locale, 'قيود مسودة', 'Draft Journals')}</span>
          <strong>{dashboard?.kpis.draftEntries ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'فواتير قيد المتابعة', 'Pending Invoices')}</span>
          <strong>{dashboard?.kpis.pendingInvoices ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'مدفوعات معلقة', 'Pending Payments')}</span>
          <strong>{dashboard?.kpis.pendingPayments ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'أصول نشطة', 'Active Assets')}</span>
          <strong>{dashboard?.kpis.activeAssets ?? 0}</strong>
        </article>
      </section>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جاري تحميل البيانات...', 'Loading data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'مؤشرات مالية', 'Financial Snapshot')} eyebrow="Reports">
        <div className="dashboard-grid">
          <article className="metric-card">
            <span>{pickLocalized(locale, 'صافي الربح', 'Net Income')}</span>
            <strong>{money(dashboard?.incomeStatement.netIncome)} KWD</strong>
          </article>
          <article className="metric-card">
            <span>{pickLocalized(locale, 'إجمالي الأصول', 'Total Assets')}</span>
            <strong>{money(dashboard?.balanceSheet.totals.totalAssets)} KWD</strong>
          </article>
          <article className="metric-card">
            <span>{pickLocalized(locale, 'صافي التدفق النقدي', 'Net Cash Flow')}</span>
            <strong>{money(dashboard?.cashFlow.netCashFlow)} KWD</strong>
          </article>
          <article className="metric-card">
            <span>{pickLocalized(locale, 'فرق ميزان المراجعة', 'Trial Balance Difference')}</span>
            <strong>{money(dashboard?.trialBalance.totals.difference)} KWD</strong>
          </article>
        </div>
      </SectionCard>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Journals</p>
              <h2>{pickLocalized(locale, 'القيود المسودة', 'Draft Journals')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.draftJournals.map((journal) => (
              <article key={journal.id} className="list-card">
                <div className="list-card-head">
                  <strong>{journal.entryNumber}</strong>
                  <span className="status-pill">{journal.status}</span>
                </div>
                <span className="muted">{shortDate(journal.date)}</span>
                <span>{journal.description || pickLocalized(locale, 'بدون وصف', 'No description')}</span>
                <span className="muted">
                  {pickLocalized(locale, 'مدين', 'Debit')}: {money(journal.totalDebit)} | {pickLocalized(locale, 'دائن', 'Credit')}: {money(journal.totalCredit)}
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busyKey === `journal:${journal.id}`}
                  onClick={() => void handlePostJournal(journal.id)}
                >
                  {busyKey === `journal:${journal.id}`
                    ? pickLocalized(locale, 'جارٍ الترحيل...', 'Posting...')
                    : pickLocalized(locale, 'ترحيل', 'Post')}
                </button>
              </article>
            ))}
            {!dashboard?.draftJournals.length ? (
              <div className="empty-state">{pickLocalized(locale, 'لا توجد قيود مسودة', 'No draft journals')}</div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Periods</p>
              <h2>{pickLocalized(locale, 'الفترات المحاسبية', 'Accounting Periods')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.periods.slice(0, 8).map((period) => (
              <article key={period.id} className="list-card">
                <div className="list-card-head">
                  <strong>{period.name || `${pickLocalized(locale, 'فترة', 'Period')} ${period.number}`}</strong>
                  <span className="status-pill">{period.status}</span>
                </div>
                <span className="muted">
                  {shortDate(period.startDate)} - {shortDate(period.endDate)}
                </span>
                <span className="muted">{period.fiscalYear?.name || '-'}</span>
                <div className="attachment-actions">
                  {period.status === 'OPEN' ? (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busyKey === `close:${period.id}`}
                      onClick={() => void handleClosePeriod(period)}
                    >
                      {busyKey === `close:${period.id}`
                        ? pickLocalized(locale, 'جارٍ الإقفال...', 'Closing...')
                        : pickLocalized(locale, 'إقفال الشهر', 'Close Month')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busyKey === `open:${period.id}`}
                      onClick={() => void handleReopenPeriod(period)}
                    >
                      {busyKey === `open:${period.id}`
                        ? pickLocalized(locale, 'جارٍ الفتح...', 'Opening...')
                        : pickLocalized(locale, 'إعادة فتح', 'Reopen')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Events</p>
              <h2>{pickLocalized(locale, 'الأحداث المحاسبية', 'Accounting Events')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.events.map((event) => (
              <article key={event.id} className="list-card">
                <div className="list-card-head">
                  <strong>{event.name}</strong>
                  <span className="status-pill">{event.status}</span>
                </div>
                <span className="muted">{shortDate(event.createdAt)}</span>
                {event.error ? <span className="muted">{event.error}</span> : null}
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">COA</p>
              <h2>{pickLocalized(locale, 'حسابات رئيسية', 'Accounts Snapshot')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.accounts.map((account) => (
              <article key={account.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {account.code} - {account.nameAr}
                  </strong>
                  <span className="status-pill">{account.type}</span>
                </div>
                <span className="muted">
                  {account.allowPosting
                    ? pickLocalized(locale, 'يسمح بالترحيل', 'Posting Enabled')
                    : pickLocalized(locale, 'بدون ترحيل مباشر', 'No Direct Posting')}
                </span>
                <span className="muted">
                  {account.isActive
                    ? pickLocalized(locale, 'نشط', 'Active')
                    : pickLocalized(locale, 'معطل', 'Inactive')}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
