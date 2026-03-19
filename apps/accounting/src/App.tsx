import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  fiscalYearId: number;
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
  period?: { dateFrom: string; dateTo: string };
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  compare?: {
    compareWith: string;
    period: { dateFrom: string; dateTo: string };
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
};

type BalanceSheet = {
  asOfDate?: string;
  assets?: BalanceSheetRow[];
  liabilities?: BalanceSheetRow[];
  equity?: BalanceSheetRow[];
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
  period?: { dateFrom: string; dateTo: string };
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
  nameEn?: string | null;
  type: string;
  allowPosting: boolean;
  isActive: boolean;
};

type TrialBalanceRow = {
  accountId?: number;
  debit: number | string;
  credit: number | string;
  closingBalance?: number | string;
  account?: {
    id: number;
    code: string;
    nameAr: string;
    nameEn?: string | null;
    type?: string;
    normalBalance?: string;
  };
};

type TrialBalanceReport = {
  accounts: TrialBalanceRow[];
  totals: {
    debit: number;
    credit: number;
    difference: number;
  };
};

type BalanceSheetRow =
  | {
      account: { id: number; code: string; nameAr: string; nameEn?: string | null; type?: string };
      closingBalance: number | string;
    }
  | {
      id: number;
      code: string;
      nameAr: string;
      nameEn?: string | null;
      balances?: Array<{ closingBalance?: number | string }>;
    };

type AccountStatementRow = {
  date: string;
  entryNumber: string;
  description?: string | null;
  debit: number;
  credit: number;
  balance: number;
};

type AccountStatementReport = {
  account: AccountRow | null;
  period: { dateFrom: string; dateTo: string };
  rows: AccountStatementRow[];
  summary: { totalDebit: number; totalCredit: number; closingBalance: number };
};

type AccountBalanceCell = {
  debit: number;
  credit: number;
  closingBalance: number;
};

type AccountTreeNode = {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: string;
  parentId: number | null;
  level: number;
  isControl: boolean;
  allowPosting: boolean;
  isActive: boolean;
  own: AccountBalanceCell;
  aggregate: AccountBalanceCell;
  children: AccountTreeNode[];
};

type RowsEnvelope<T> = {
  rows: T[];
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

type ReportsState = {
  trialBalance: TrialBalanceReport;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlow;
  accountStatement: AccountStatementReport | null;
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

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.rows ?? [];
}

function appendQuery(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function balanceSheetValue(row: BalanceSheetRow) {
  if ('closingBalance' in row) {
    return Number(row.closingBalance ?? 0);
  }
  return Number(row.balances?.[0]?.closingBalance ?? 0);
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [activePage, setActivePage] = useState<'dashboard' | 'coa' | 'reports'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [coaTree, setCoaTree] = useState<AccountTreeNode[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);
  const [coaError, setCoaError] = useState<string | null>(null);
  const [coaFilters, setCoaFilters] = useState({
    includeInactive: false,
    fiscalYear: '',
    period: ''
  });
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportsState | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportFilters, setReportFilters] = useState({
    fiscalYear: '',
    period: '',
    dateFrom: '',
    dateTo: '',
    asOfDate: '',
    compareWith: '',
    accountId: ''
  });
  const [reportAccounts, setReportAccounts] = useState<AccountRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fiscalYearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const period of dashboard?.periods ?? []) {
      const byName = Number(period.fiscalYear?.name ?? '');
      if (Number.isFinite(byName) && byName > 0) {
        years.add(byName);
        continue;
      }
      const byStart = Number.isNaN(Date.parse(period.startDate)) ? undefined : new Date(period.startDate).getUTCFullYear();
      if (byStart) years.add(byStart);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [dashboard?.periods]);

  const periodOptions = useMemo(() => {
    const periods = new Set<number>();
    for (const period of dashboard?.periods ?? []) {
      if (Number.isFinite(period.number)) {
        periods.add(period.number);
      }
    }
    return Array.from(periods).sort((a, b) => a - b);
  }, [dashboard?.periods]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [kpis, periods, journals, trialBalance, incomeStatement, balanceSheet, cashFlow, events, accounts] =
        await Promise.all([
          getJson<Kpis>('/reports/kpis'),
          getJson<PeriodRow[] | RowsEnvelope<PeriodRow>>('/periods'),
          getJson<JournalRow[] | RowsEnvelope<JournalRow>>('/journals?status=DRAFT&limit=8'),
          getJson<TrialBalance>('/reports/trial-balance'),
          getJson<IncomeStatement>('/reports/income-statement'),
          getJson<BalanceSheet>('/reports/balance-sheet'),
          getJson<CashFlow>('/reports/cash-flow'),
          getJson<AccountingEventRow[] | RowsEnvelope<AccountingEventRow>>('/accounting/events?limit=8'),
          getJson<AccountRow[] | RowsEnvelope<AccountRow>>('/accounts?limit=8')
        ]);

      setDashboard({
        kpis: kpis.data,
        periods: normalizeRows(periods.data),
        draftJournals: normalizeRows(journals.data),
        trialBalance: trialBalance.data,
        incomeStatement: incomeStatement.data,
        balanceSheet: balanceSheet.data,
        cashFlow: cashFlow.data,
        events: normalizeRows(events.data),
        accounts: normalizeRows(accounts.data)
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل لوحة المحاسبة', 'Failed to load accounting dashboard'));
    } finally {
      setLoading(false);
    }
  }

  function collectNodeIds(nodes: AccountTreeNode[], bucket: number[] = []) {
    for (const node of nodes) {
      bucket.push(node.id);
      if (node.children?.length) {
        collectNodeIds(node.children, bucket);
      }
    }
    return bucket;
  }

  async function loadCoa() {
    setCoaLoading(true);
    setCoaError(null);

    try {
      const params = new URLSearchParams();
      if (coaFilters.includeInactive) params.set('includeInactive', 'true');
      if (coaFilters.fiscalYear) params.set('fiscalYear', coaFilters.fiscalYear);
      if (coaFilters.period) params.set('period', coaFilters.period);

      const path = params.toString() ? `/accounts/tree/with-balances?${params.toString()}` : '/accounts/tree/with-balances';
      const response = await getJson<AccountTreeNode[]>(path);
      setCoaTree(response.data);
      setExpandedNodes(new Set(response.data.map((node) => node.id)));
    } catch (treeError) {
      setCoaError(
        treeError instanceof Error
          ? treeError.message
          : pickLocalized(locale, 'تعذر تحميل شجرة الحسابات', 'Failed to load chart of accounts')
      );
    } finally {
      setCoaLoading(false);
    }
  }

  async function loadReports() {
    setReportsLoading(true);
    setReportsError(null);

    try {
      const baseQuery = new URLSearchParams();
      if (reportFilters.fiscalYear) baseQuery.set('fiscalYear', reportFilters.fiscalYear);
      if (reportFilters.period) baseQuery.set('period', reportFilters.period);
      if (reportFilters.dateFrom) baseQuery.set('dateFrom', reportFilters.dateFrom);
      if (reportFilters.dateTo) baseQuery.set('dateTo', reportFilters.dateTo);

      const incomeQuery = new URLSearchParams(baseQuery);
      if (reportFilters.compareWith) incomeQuery.set('compareWith', reportFilters.compareWith);

      const balanceQuery = new URLSearchParams(baseQuery);
      if (reportFilters.asOfDate) balanceQuery.set('asOfDate', reportFilters.asOfDate);

      const statementQuery = new URLSearchParams(baseQuery);
      if (reportFilters.accountId) statementQuery.set('accountId', reportFilters.accountId);

      const [trialBalance, incomeStatement, balanceSheet, cashFlow, accounts, accountStatement] = await Promise.all([
        getJson<TrialBalanceReport>(appendQuery('/reports/trial-balance', baseQuery)),
        getJson<IncomeStatement>(appendQuery('/reports/income-statement', incomeQuery)),
        getJson<BalanceSheet>(appendQuery('/reports/balance-sheet', balanceQuery)),
        getJson<CashFlow>(appendQuery('/reports/cash-flow', baseQuery)),
        getJson<AccountRow[] | RowsEnvelope<AccountRow>>('/accounts?limit=200'),
        reportFilters.accountId
          ? getJson<AccountStatementReport>(appendQuery('/reports/account-statement', statementQuery))
          : Promise.resolve(null)
      ]);

      setReportAccounts(normalizeRows(accounts.data));
      setReports({
        trialBalance: trialBalance.data,
        incomeStatement: incomeStatement.data,
        balanceSheet: balanceSheet.data,
        cashFlow: cashFlow.data,
        accountStatement: accountStatement ? accountStatement.data : null
      });
    } catch (loadError) {
      setReportsError(
        loadError instanceof Error ? loadError.message : pickLocalized(locale, 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±', 'Failed to load reports')
      );
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activePage === 'coa' && !coaTree.length && !coaLoading) {
      void loadCoa();
    }
    if (activePage === 'reports' && !reports && !reportsLoading) {
      void loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

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

  function toggleNode(id: number) {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedNodes(new Set(collectNodeIds(coaTree)));
  }

  function collapseAll() {
    setExpandedNodes(new Set());
  }

  async function handleCoaFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadCoa();
  }

  async function handleReportsFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadReports();
  }

  function renderCoaNode(node: AccountTreeNode, depth = 0) {
    const hasChildren = node.children?.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const name = locale === 'ar' ? node.nameAr : node.nameEn || node.nameAr;
    const ownLabel = `${money(node.own.debit)} / ${money(node.own.credit)} / ${money(node.own.closingBalance)}`;

    return (
      <div key={node.id}>
        <div
          className="ui-list-item"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 2fr) 110px 110px 130px 130px 130px',
            gap: '8px',
            alignItems: 'center'
          }}
          title={`${pickLocalized(locale, 'الرصيد الذاتي', 'Own')}: ${ownLabel}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <button type="button" className="ui-link" onClick={() => toggleNode(node.id)}>
                {isExpanded ? '-' : '+'}
              </button>
            ) : (
              <span style={{ width: '16px' }} />
            )}
            <div>
              <strong>{node.code}</strong>
              <span className="ui-muted"> {name}</span>
            </div>
          </div>
          <span>{node.type}</span>
          <span className="ui-muted">
            {node.allowPosting
              ? pickLocalized(locale, 'قابل للترحيل', 'Posting')
              : pickLocalized(locale, 'تجميعي', 'Control')}
          </span>
          <span>{money(node.aggregate.debit)}</span>
          <span>{money(node.aggregate.credit)}</span>
          <span>{money(node.aggregate.closingBalance)}</span>
        </div>
        {hasChildren && isExpanded ? node.children.map((child) => renderCoaNode(child, depth + 1)) : null}
      </div>
    );
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

  const pageLabel =
    activePage === 'dashboard'
      ? pickLocalized(locale, 'Ø§Ù„Ù„ÙˆØ­Ø©', 'Dashboard')
      : activePage === 'coa'
        ? pickLocalized(locale, 'Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª', 'Chart of Accounts')
        : pickLocalized(locale, 'Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±', 'Reports');

  const refreshActivePage =
    activePage === 'dashboard'
      ? () => void loadDashboard()
      : activePage === 'coa'
        ? () => void loadCoa()
        : () => void loadReports();

  const trialBalanceRows = reports?.trialBalance.accounts ?? [];
  const incomeCompare = reports?.incomeStatement.compare;
  const balanceSheetAssets = reports?.balanceSheet.assets ?? [];
  const balanceSheetLiabilities = reports?.balanceSheet.liabilities ?? [];
  const balanceSheetEquity = reports?.balanceSheet.equity ?? [];

  return (
    <AppShell
      locale={locale}
      title={locale === 'ar' ? system.titleAr : system.titleEn}
      subtitle={locale === 'ar' ? system.descriptionAr : system.descriptionEn}
      breadcrumbs={
        <span className="ui-muted">
          {system.routeBase} / {pageLabel}
        </span>
      }
      actions={
        <div className="ui-actions">
          <a className="ui-link" href="/portal">
            {pickLocalized(locale, 'العودة إلى البوابة', 'Back to Portal')}
          </a>
          <button type="button" className="ui-link" onClick={refreshActivePage}>
            {pickLocalized(locale, 'ØªØ­Ø¯ÙŠØ«', 'Refresh')}
          </button>
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
      <div className="ui-actions" style={{ marginBottom: '16px' }}>
        <button
          type="button"
          className={activePage === 'dashboard' ? 'ui-button' : 'ui-link'}
          onClick={() => setActivePage('dashboard')}
        >
          {pickLocalized(locale, 'Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø©', 'Accounting Dashboard')}
        </button>
        <button
          type="button"
          className={activePage === 'coa' ? 'ui-button' : 'ui-link'}
          onClick={() => setActivePage('coa')}
        >
          {pickLocalized(locale, 'Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª', 'Chart of Accounts')}
        </button>
        <button
          type="button"
          className={activePage === 'reports' ? 'ui-button' : 'ui-link'}
          onClick={() => setActivePage('reports')}
        >
          {pickLocalized(locale, 'Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±', 'Reports')}
        </button>
      </div>
      {activePage === 'dashboard' ? (
        <>
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
        </>
      ) : null}

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
        </>
      ) : null}

      {activePage === 'coa' ? (
        <SectionCard title={pickLocalized(locale, 'شجرة الحسابات', 'Chart of Accounts')} eyebrow="COA">
        <form className="ui-form" onSubmit={handleCoaFilter}>
          <label>
            <span>{pickLocalized(locale, 'السنة المالية', 'Fiscal Year')}</span>
            <select
              value={coaFilters.fiscalYear}
              onChange={(event) => setCoaFilters((current) => ({ ...current, fiscalYear: event.target.value }))}
            >
              <option value="">{pickLocalized(locale, 'كل السنوات', 'All years')}</option>
              {fiscalYearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الفترة', 'Period')}</span>
            <select
              value={coaFilters.period}
              onChange={(event) => setCoaFilters((current) => ({ ...current, period: event.target.value }))}
            >
              <option value="">{pickLocalized(locale, 'كل الفترات', 'All periods')}</option>
              {periodOptions.map((period) => (
                <option key={period} value={String(period)}>
                  {period}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الحسابات غير النشطة', 'Include inactive')}</span>
            <input
              type="checkbox"
              checked={coaFilters.includeInactive}
              onChange={(event) => setCoaFilters((current) => ({ ...current, includeInactive: event.target.checked }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={coaLoading}>
            {coaLoading ? '...' : pickLocalized(locale, 'تحديث الشجرة', 'Refresh Tree')}
          </button>
        </form>

        <div className="ui-actions">
          <button type="button" className="ui-link" onClick={expandAll}>
            {pickLocalized(locale, 'توسيع الكل', 'Expand all')}
          </button>
          <button type="button" className="ui-link" onClick={collapseAll}>
            {pickLocalized(locale, 'طي الكل', 'Collapse all')}
          </button>
        </div>

        {coaError ? <div className="error-banner">{coaError}</div> : null}
        {coaLoading ? <div className="empty-state">{pickLocalized(locale, 'جاري تحميل الشجرة...', 'Loading tree...')}</div> : null}
        {!coaLoading && !coaTree.length ? (
          <div className="empty-state">{pickLocalized(locale, 'لا توجد حسابات بعد', 'No accounts yet')}</div>
        ) : null}

        {coaTree.length ? (
          <div className="ui-list">
            <div
              className="ui-list-item"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 2fr) 110px 110px 130px 130px 130px',
                gap: '8px',
                alignItems: 'center'
              }}
            >
              <strong>{pickLocalized(locale, 'الحساب', 'Account')}</strong>
              <strong>{pickLocalized(locale, 'النوع', 'Type')}</strong>
              <strong>{pickLocalized(locale, 'الحالة', 'Posting')}</strong>
              <strong>{pickLocalized(locale, 'مدين', 'Debit')}</strong>
              <strong>{pickLocalized(locale, 'دائن', 'Credit')}</strong>
              <strong>{pickLocalized(locale, 'الرصيد', 'Balance')}</strong>
            </div>
            {coaTree.map((node) => renderCoaNode(node))}
          </div>
        ) : null}
      </SectionCard>
      ) : null}
      {activePage === 'reports' ? (
        <>
          <SectionCard title={pickLocalized(locale, 'ÙÙ„Ø§ØªØ± Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±', 'Report Filters')} eyebrow="Filters">
            <form className="ui-form" onSubmit={handleReportsFilter}>
              <label>
                <span>{pickLocalized(locale, 'Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©', 'Fiscal Year')}</span>
                <select
                  value={reportFilters.fiscalYear}
                  onChange={(event) => setReportFilters((current) => ({ ...current, fiscalYear: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, 'ÙƒÙ„ Ø§Ù„Ø³Ù†ÙˆØ§Øª', 'All years')}</option>
                  {fiscalYearOptions.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ø§Ù„ÙØªØ±Ø©', 'Period')}</span>
                <select
                  value={reportFilters.period}
                  onChange={(event) => setReportFilters((current) => ({ ...current, period: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, 'ÙƒÙ„ Ø§Ù„ÙØªØ±Ø§Øª', 'All periods')}</option>
                  {periodOptions.map((period) => (
                    <option key={period} value={String(period)}>
                      {period}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ù…Ù† ØªØ§Ø±ÙŠØ®', 'Date from')}</span>
                <input
                  type="date"
                  value={reportFilters.dateFrom}
                  onChange={(event) => setReportFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®', 'Date to')}</span>
                <input
                  type="date"
                  value={reportFilters.dateTo}
                  onChange={(event) => setReportFilters((current) => ({ ...current, dateTo: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ø§Ù„ØªØ§Ø±ÙŠØ® Ù„Ù„Ù…ÙŠØ²Ø§Ù†', 'As of date')}</span>
                <input
                  type="date"
                  value={reportFilters.asOfDate}
                  onChange={(event) => setReportFilters((current) => ({ ...current, asOfDate: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ù…Ù‚Ø§Ø±Ù†Ø© Ø§Ù„Ø¯Ø®Ù„', 'Compare income')}</span>
                <select
                  value={reportFilters.compareWith}
                  onChange={(event) => setReportFilters((current) => ({ ...current, compareWith: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, 'Ø¨Ø¯ÙˆÙ† Ù…Ù‚Ø§Ø±Ù†Ø©', 'No comparison')}</option>
                  <option value="previous-period">{pickLocalized(locale, 'Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©', 'Previous period')}</option>
                  <option value="previous-year">{pickLocalized(locale, 'Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©', 'Previous year')}</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'Ø­Ø³Ø§Ø¨ Ø§Ù„ÙƒØ´Ù', 'Account statement')}</span>
                <select
                  value={reportFilters.accountId}
                  onChange={(event) => setReportFilters((current) => ({ ...current, accountId: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, 'Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨', 'Select account')}</option>
                  {reportAccounts
                    .slice()
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((account) => (
                      <option key={account.id} value={String(account.id)}>
                        {account.code} - {account.nameAr}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" className="ui-button" disabled={reportsLoading}>
                {reportsLoading ? '...' : pickLocalized(locale, 'ØªØ­Ø¯ÙŠØ« Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±', 'Refresh Reports')}
              </button>
            </form>
          </SectionCard>

          {reportsError ? <div className="error-banner">{reportsError}</div> : null}
          {reportsLoading ? <div className="empty-state">{pickLocalized(locale, 'Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±...', 'Loading reports...')}</div> : null}

          <SectionCard title={pickLocalized(locale, 'Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', 'Trial Balance')} eyebrow="Reports">
            <div className="dashboard-grid">
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¯ÙŠÙ†', 'Total Debit')}</span>
                <strong>{money(reports?.trialBalance.totals.debit)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¯Ø§Ø¦Ù†', 'Total Credit')}</span>
                <strong>{money(reports?.trialBalance.totals.credit)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø§Ù„ÙØ±Ù‚', 'Difference')}</span>
                <strong>{money(reports?.trialBalance.totals.difference)} KWD</strong>
              </article>
            </div>
            {trialBalanceRows.length ? (
              <div className="ui-list">
                <div
                  className="ui-list-item"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(240px, 2fr) 130px 130px 130px',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  <strong>{pickLocalized(locale, 'Ø§Ù„Ø­Ø³Ø§Ø¨', 'Account')}</strong>
                  <strong>{pickLocalized(locale, 'Ù…Ø¯ÙŠÙ†', 'Debit')}</strong>
                  <strong>{pickLocalized(locale, 'Ø¯Ø§Ø¦Ù†', 'Credit')}</strong>
                  <strong>{pickLocalized(locale, 'Ø§Ù„Ø±ØµÙŠØ¯', 'Balance')}</strong>
                </div>
                {trialBalanceRows.map((row) => {
                  const label = row.account ? `${row.account.code} - ${row.account.nameAr}` : pickLocalized(locale, 'Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ', 'Unknown account');
                  const closing = Number(row.closingBalance ?? 0);
                  return (
                    <div
                      key={`${row.account?.id ?? row.accountId ?? label}`}
                      className="ui-list-item"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(240px, 2fr) 130px 130px 130px',
                        gap: '8px',
                        alignItems: 'center'
                      }}
                    >
                      <span>{label}</span>
                      <span>{money(row.debit)}</span>
                      <span>{money(row.credit)}</span>
                      <span>{money(closing)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">{pickLocalized(locale, 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„Ù…ÙŠØ²Ø§Ù†', 'No trial balance rows')}</div>
            )}
          </SectionCard>

          <SectionCard title={pickLocalized(locale, 'Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯Ø®Ù„', 'Income Statement')} eyebrow="Reports">
            <div className="dashboard-grid">
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª', 'Total Revenue')}</span>
                <strong>{money(reports?.incomeStatement.totalRevenue)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª', 'Total Expenses')}</span>
                <strong>{money(reports?.incomeStatement.totalExpenses)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­', 'Net Income')}</span>
                <strong>{money(reports?.incomeStatement.netIncome)} KWD</strong>
              </article>
            </div>
            {incomeCompare ? (
              <div className="ui-list">
                <div className="ui-list-item">
                  <strong>
                    {pickLocalized(locale, 'Ù…Ù‚Ø§Ø±Ù†Ø©', 'Comparison')} ({incomeCompare.compareWith})
                  </strong>
                  <span>
                    {pickLocalized(locale, 'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­', 'Net Income')}: {money(incomeCompare.netIncome)} KWD
                  </span>
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={pickLocalized(locale, 'Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„Ø¹Ù…ÙˆÙ…', 'Balance Sheet')} eyebrow="Reports">
            <div className="dashboard-grid">
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£ØµÙˆÙ„', 'Total Assets')}</span>
                <strong>{money(reports?.balanceSheet.totals.totalAssets)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª', 'Total Liabilities')}</span>
                <strong>{money(reports?.balanceSheet.totals.totalLiabilities)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©', 'Total Equity')}</span>
                <strong>{money(reports?.balanceSheet.totals.totalEquity)} KWD</strong>
              </article>
            </div>

            <section className="surface split-surface">
              <div>
                <div className="surface-header">
                  <div>
                    <p className="eyebrow">Assets</p>
                    <h2>{pickLocalized(locale, 'Ø§Ù„Ø£ØµÙˆÙ„', 'Assets')}</h2>
                  </div>
                </div>
                <div className="ui-list">
                  {balanceSheetAssets.map((row) => (
                    <div key={`asset-${'account' in row ? row.account.id : row.id}`} className="ui-list-item">
                      <span>
                        {'account' in row ? `${row.account.code} - ${row.account.nameAr}` : `${row.code} - ${row.nameAr}`}
                      </span>
                      <span>{money(balanceSheetValue(row))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="surface-header">
                  <div>
                    <p className="eyebrow">Liabilities</p>
                    <h2>{pickLocalized(locale, 'Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª', 'Liabilities')}</h2>
                  </div>
                </div>
                <div className="ui-list">
                  {balanceSheetLiabilities.map((row) => (
                    <div key={`liability-${'account' in row ? row.account.id : row.id}`} className="ui-list-item">
                      <span>
                        {'account' in row ? `${row.account.code} - ${row.account.nameAr}` : `${row.code} - ${row.nameAr}`}
                      </span>
                      <span>{money(balanceSheetValue(row))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="surface">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Equity</p>
                  <h2>{pickLocalized(locale, 'Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©', 'Equity')}</h2>
                </div>
              </div>
              <div className="ui-list">
                {balanceSheetEquity.map((row) => (
                  <div key={`equity-${'account' in row ? row.account.id : row.id}`} className="ui-list-item">
                    <span>
                      {'account' in row ? `${row.account.code} - ${row.account.nameAr}` : `${row.code} - ${row.nameAr}`}
                    </span>
                    <span>{money(balanceSheetValue(row))}</span>
                  </div>
                ))}
              </div>
            </section>
          </SectionCard>

          <SectionCard title={pickLocalized(locale, 'ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯', 'Cash Flow')} eyebrow="Reports">
            <div className="dashboard-grid">
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ©', 'Operating Inflow')}</span>
                <strong>{money(reports?.cashFlow.operatingInflow)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'Ù…ØµØ±ÙˆÙØ§Øª ØªØ´ØºÙŠÙ„ÙŠØ©', 'Operating Outflow')}</span>
                <strong>{money(reports?.cashFlow.operatingOutflow)} KWD</strong>
              </article>
              <article className="metric-card">
                <span>{pickLocalized(locale, 'ØµØ§ÙÙŠ Ø§Ù„ØªØ¯ÙÙ‚', 'Net Cash Flow')}</span>
                <strong>{money(reports?.cashFlow.netCashFlow)} KWD</strong>
              </article>
            </div>
          </SectionCard>

          <SectionCard title={pickLocalized(locale, 'ÙƒØ´Ù Ø­Ø³Ø§Ø¨', 'Account Statement')} eyebrow="Reports">
            {!reports?.accountStatement && !reportFilters.accountId ? (
              <div className="empty-state">{pickLocalized(locale, 'Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Ù„Ø¹Ø±Ø¶ Ø§Ù„ÙƒØ´Ù', 'Select an account to view the statement')}</div>
            ) : null}
            {reports?.accountStatement ? (
              <>
                <div className="dashboard-grid">
                  <article className="metric-card">
                    <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¯ÙŠÙ†', 'Total Debit')}</span>
                    <strong>{money(reports.accountStatement.summary.totalDebit)} KWD</strong>
                  </article>
                  <article className="metric-card">
                    <span>{pickLocalized(locale, 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¯Ø§Ø¦Ù†', 'Total Credit')}</span>
                    <strong>{money(reports.accountStatement.summary.totalCredit)} KWD</strong>
                  </article>
                  <article className="metric-card">
                    <span>{pickLocalized(locale, 'Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø®ØªØ§Ù…ÙŠ', 'Closing Balance')}</span>
                    <strong>{money(reports.accountStatement.summary.closingBalance)} KWD</strong>
                  </article>
                </div>
                <div className="ui-list">
                  <div
                    className="ui-list-item"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 150px minmax(200px, 2fr) 120px 120px 120px',
                      gap: '8px',
                      alignItems: 'center'
                    }}
                  >
                    <strong>{pickLocalized(locale, 'Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Date')}</strong>
                    <strong>{pickLocalized(locale, 'Ø±Ù‚Ù… Ø§Ù„Ù‚ÙŠØ¯', 'Entry')}</strong>
                    <strong>{pickLocalized(locale, 'Ø§Ù„ÙˆØµÙ', 'Description')}</strong>
                    <strong>{pickLocalized(locale, 'Ù…Ø¯ÙŠÙ†', 'Debit')}</strong>
                    <strong>{pickLocalized(locale, 'Ø¯Ø§Ø¦Ù†', 'Credit')}</strong>
                    <strong>{pickLocalized(locale, 'Ø§Ù„Ø±ØµÙŠØ¯', 'Balance')}</strong>
                  </div>
                  {reports.accountStatement.rows.map((row, index) => (
                    <div
                      key={`${row.entryNumber}-${index}`}
                      className="ui-list-item"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '140px 150px minmax(200px, 2fr) 120px 120px 120px',
                        gap: '8px',
                        alignItems: 'center'
                      }}
                    >
                      <span>{shortDate(row.date)}</span>
                      <span>{row.entryNumber}</span>
                      <span>{row.description || '-'}</span>
                      <span>{money(row.debit)}</span>
                      <span>{money(row.credit)}</span>
                      <span>{money(row.balance)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </AppShell>
  );
}




