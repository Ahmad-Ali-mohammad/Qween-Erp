import { useEffect, useMemo, useState } from 'react';
import { getJson } from '@erp-qween/api-client';
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

type SalesRow = {
  id: number;
  invoiceNumber?: string | null;
  total: number | string;
  outstanding: number | string;
  date: string;
  customer?: { code?: string | null; nameAr?: string | null } | null;
};

type SalesReport = {
  summary: {
    count: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    paid: number;
    outstanding: number;
  };
  rows: SalesRow[];
};

type PurchasesRow = {
  id: number;
  invoiceNumber?: string | null;
  total: number | string;
  outstanding: number | string;
  date: string;
  supplier?: { code?: string | null; nameAr?: string | null } | null;
};

type PurchasesReport = {
  summary: {
    count: number;
    total: number;
    outstanding: number;
    purchaseReturnsTotal: number;
    netPurchases: number;
  };
  rows: PurchasesRow[];
};

type InventoryMovement = {
  id: number;
  reference?: string | null;
  type: string;
  date: string;
  quantity: number | string;
  totalCost: number | string;
};

type InventoryReport = {
  summary: {
    items: number;
    totalQty: number;
    totalValue: number;
    belowReorder: number;
  };
  movements: InventoryMovement[];
};

type AgingRow = {
  id: number;
  code: string;
  nameAr: string;
  total: number;
  bucket0to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90plus: number;
};

type CashFlow = {
  operatingInflow: number;
  operatingOutflow: number;
  netCashFlow: number;
};

type IncomeComparative = {
  current: number;
  previous: number;
  delta: number;
  changePct: number;
};

type DashboardState = {
  kpis: Kpis;
  sales: SalesReport;
  purchases: PurchasesReport;
  inventory: InventoryReport;
  receivables: AgingRow[];
  payables: AgingRow[];
  cashFlow: CashFlow;
  incomeComparative: IncomeComparative;
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

function buildIncomeComparativeQuery() {
  const now = new Date();
  const currentFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const previousFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  const toIso = (value: Date) => value.toISOString().slice(0, 10);
  const query = new URLSearchParams({
    currentFrom: toIso(currentFrom),
    currentTo: toIso(currentTo),
    previousFrom: toIso(previousFrom),
    previousTo: toIso(previousTo)
  });

  return query.toString();
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const incomeComparativeQuery = buildIncomeComparativeQuery();
      const [kpis, sales, purchases, inventory, receivables, payables, cashFlow, incomeComparative] =
        await Promise.all([
          getJson<Kpis>('/reports/kpis'),
          getJson<SalesReport>('/reports/sales'),
          getJson<PurchasesReport>('/reports/purchases'),
          getJson<InventoryReport>('/reports/inventory'),
          getJson<AgingRow[]>('/reports/aging?type=customers'),
          getJson<AgingRow[]>('/reports/aging?type=suppliers'),
          getJson<CashFlow>('/reports/cash-flow'),
          getJson<IncomeComparative>(`/reports/income-comparative?${incomeComparativeQuery}`)
        ]);

      setDashboard({
        kpis: kpis.data,
        sales: sales.data,
        purchases: purchases.data,
        inventory: inventory.data,
        receivables: receivables.data,
        payables: payables.data,
        cashFlow: cashFlow.data,
        incomeComparative: incomeComparative.data
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل لوحة التقارير', 'Failed to load BI dashboard')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
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
          <button type="button" className="ui-link" onClick={() => void loadDashboard()}>
            {pickLocalized(locale, 'تحديث', 'Refresh')}
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
      <section className="dashboard-grid">
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي المبيعات', 'Total Sales')}</span>
          <strong>{money(dashboard?.sales.summary.total)} KWD</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'صافي المشتريات', 'Net Purchases')}</span>
          <strong>{money(dashboard?.purchases.summary.netPurchases)} KWD</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'قيمة المخزون', 'Inventory Value')}</span>
          <strong>{money(dashboard?.inventory.summary.totalValue)} KWD</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'صافي التدفق النقدي', 'Net Cash Flow')}</span>
          <strong>{money(dashboard?.cashFlow.netCashFlow)} KWD</strong>
        </article>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جارٍ تحميل التقارير...', 'Loading reports...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'مؤشرات تنفيذية', 'Executive Indicators')} eyebrow="KPIs">
        <div className="dashboard-grid">
          <article className="metric-card">
            <span>{pickLocalized(locale, 'قيود مسودة', 'Draft Journals')}</span>
            <strong>{dashboard?.kpis.draftEntries ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span>{pickLocalized(locale, 'فواتير معلقة', 'Pending Invoices')}</span>
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
          <article className="metric-card">
            <span>{pickLocalized(locale, 'تغير الدخل الشهري', 'Monthly Income Delta')}</span>
            <strong>{money(dashboard?.incomeComparative.delta)} KWD</strong>
          </article>
          <article className="metric-card">
            <span>{pickLocalized(locale, 'نسبة التغير', 'Change %')}</span>
            <strong>{Number(dashboard?.incomeComparative.changePct ?? 0).toFixed(2)}%</strong>
          </article>
        </div>
      </SectionCard>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Sales</p>
              <h2>{pickLocalized(locale, 'العملاء والتحصيل', 'Sales & Collection')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.sales.rows.slice(0, 6).map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-head">
                  <strong>{row.invoiceNumber || `INV-${row.id}`}</strong>
                  <span className="status-pill">{shortDate(row.date)}</span>
                </div>
                <span>
                  {row.customer?.code || '-'} -{' '}
                  {row.customer?.nameAr || pickLocalized(locale, 'عميل غير معروف', 'Unknown customer')}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'الإجمالي', 'Total')}: {money(row.total)} KWD
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'المتبقي', 'Outstanding')}: {money(row.outstanding)} KWD
                </span>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Purchases</p>
              <h2>{pickLocalized(locale, 'الموردون والمشتريات', 'Purchases & Payables')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.purchases.rows.slice(0, 6).map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-head">
                  <strong>{row.invoiceNumber || `PINV-${row.id}`}</strong>
                  <span className="status-pill">{shortDate(row.date)}</span>
                </div>
                <span>
                  {row.supplier?.code || '-'} -{' '}
                  {row.supplier?.nameAr || pickLocalized(locale, 'مورد غير معروف', 'Unknown supplier')}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'الإجمالي', 'Total')}: {money(row.total)} KWD
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'المتبقي', 'Outstanding')}: {money(row.outstanding)} KWD
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">AR</p>
              <h2>{pickLocalized(locale, 'أعلى الذمم المدينة', 'Top Receivables')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.receivables.slice(0, 6).map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {row.code} - {row.nameAr}
                  </strong>
                  <span className="status-pill">{money(row.total)} KWD</span>
                </div>
                <span className="muted">0-30: {money(row.bucket0to30)}</span>
                <span className="muted">31-60: {money(row.bucket31to60)}</span>
                <span className="muted">
                  61-90: {money(row.bucket61to90)} | 90+: {money(row.bucket90plus)}
                </span>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">AP</p>
              <h2>{pickLocalized(locale, 'أعلى الذمم الدائنة', 'Top Payables')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {dashboard?.payables.slice(0, 6).map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {row.code} - {row.nameAr}
                  </strong>
                  <span className="status-pill">{money(row.total)} KWD</span>
                </div>
                <span className="muted">0-30: {money(row.bucket0to30)}</span>
                <span className="muted">31-60: {money(row.bucket31to60)}</span>
                <span className="muted">
                  61-90: {money(row.bucket61to90)} | 90+: {money(row.bucket90plus)}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SectionCard title={pickLocalized(locale, 'حركة المخزون الأخيرة', 'Recent Inventory Activity')} eyebrow="Inventory">
        <div className="list-grid">
          {dashboard?.inventory.movements.slice(0, 8).map((movement) => (
            <article key={movement.id} className="list-card">
              <div className="list-card-head">
                <strong>{movement.reference || `${movement.type} #${movement.id}`}</strong>
                <span className="status-pill">{movement.type}</span>
              </div>
              <span className="muted">{shortDate(movement.date)}</span>
              <span>
                {pickLocalized(locale, 'الكمية', 'Quantity')}: {money(movement.quantity)}
              </span>
              <span className="muted">
                {pickLocalized(locale, 'القيمة', 'Value')}: {money(movement.totalCost)} KWD
              </span>
            </article>
          ))}
          {!dashboard?.inventory.movements.length ? (
            <div className="empty-state">{pickLocalized(locale, 'لا توجد حركة مخزون', 'No inventory activity')}</div>
          ) : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
