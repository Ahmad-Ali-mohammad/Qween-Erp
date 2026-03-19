import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type BranchRow = {
  id: number;
  code: string;
  nameAr: string;
};

type WarehouseRow = {
  id: number;
  code: string;
  nameAr: string;
  branchId?: number | null;
};

type ProjectRow = {
  id: number;
  code: string;
  nameAr: string;
};

type ItemRow = {
  id: number;
  code: string;
  nameAr: string;
  onHandQty: number | string;
  inventoryValue: number | string;
  reorderPoint?: number | string | null;
  category?: { nameAr?: string | null } | null;
  unit?: { nameAr?: string | null; code?: string | null } | null;
};

type MovementRow = {
  id: number;
  date: string;
  type: string;
  reference?: string | null;
  quantity: number | string;
  totalCost: number | string;
};

type StockCountRow = {
  id: number;
  number: string;
  date: string;
  branchId?: number | null;
  warehouseId: number;
  status: string;
  notes?: string | null;
};

type RowsEnvelope<T> = {
  rows: T[];
};

type OrgBootstrap = {
  company?: { currency?: string | null } | null;
  branches: BranchRow[];
  warehouses: WarehouseRow[];
};

type InventoryReport = {
  summary: {
    items: number;
    totalQty: number;
    totalValue: number;
    belowReorder: number;
  };
  rows: ItemRow[];
  movements: MovementRow[];
};

type InventoryState = {
  bootstrap: OrgBootstrap;
  report: InventoryReport;
  items: ItemRow[];
  projects: ProjectRow[];
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.rows ?? [];
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [data, setData] = useState<InventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stockCounts, setStockCounts] = useState<StockCountRow[]>([]);
  const [form, setForm] = useState({
    date: todayIsoDate(),
    type: 'RECEIPT',
    reference: '',
    itemId: '',
    branchId: '',
    projectId: '',
    warehouseId: '',
    quantity: '1',
    unitCost: '',
    notes: ''
  });
  const [countForm, setCountForm] = useState({
    date: todayIsoDate(),
    warehouseId: '',
    notes: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [bootstrap, report, items, projects, movements, counts] = await Promise.all([
        getJson<OrgBootstrap>('/org/bootstrap'),
        getJson<InventoryReport>('/reports/inventory'),
        getJson<ItemRow[] | RowsEnvelope<ItemRow>>('/inventory/items?page=1&limit=30'),
        getJson<ProjectRow[] | RowsEnvelope<ProjectRow>>('/projects?page=1&limit=20'),
        getJson<MovementRow[] | RowsEnvelope<MovementRow>>('/inventory/stock-movements?limit=20'),
        getJson<StockCountRow[] | RowsEnvelope<StockCountRow>>('/inventory/stock-counts?limit=20')
      ]);

      setData({
        bootstrap: bootstrap.data,
        report: {
          ...report.data,
          movements: normalizeRows(movements.data)
        },
        items: normalizeRows(items.data),
        projects: normalizeRows(projects.data)
      });
      setStockCounts(normalizeRows(counts.data));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل بيانات المخزون', 'Failed to load inventory data'));
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

  async function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await postJson('/inventory/stock-movements', {
        date: form.date,
        type: form.type,
        reference: form.reference || undefined,
        itemId: Number(form.itemId),
        branchId: form.branchId ? Number(form.branchId) : undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        warehouseId: Number(form.warehouseId),
        quantity: Number(form.quantity),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        notes: form.notes || undefined
      });

      setMessage(pickLocalized(locale, 'تم تسجيل حركة المخزون بنجاح', 'Inventory movement recorded successfully'));
      setForm((current) => ({
        ...current,
        reference: '',
        quantity: '1',
        unitCost: '',
        notes: ''
      }));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر تسجيل الحركة', 'Failed to record movement'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.bootstrap.warehouses.length) {
      setError(pickLocalized(locale, 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø³ØªÙˆØ¯Ø¹Ø§Øª Ù…ØªØ§Ø­Ø©', 'No warehouses available'));
      return;
    }
    if (!countForm.warehouseId) {
      setError(pickLocalized(locale, 'ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹', 'Select a warehouse'));
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const warehouseId = Number(countForm.warehouseId);
      const warehouse = data?.bootstrap.warehouses.find((row) => row.id === warehouseId);
      const number = `SC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      await postJson('/inventory/stock-counts', {
        number,
        date: `${countForm.date}T00:00:00.000Z`,
        warehouseId,
        branchId: warehouse?.branchId ?? undefined,
        status: 'DRAFT',
        notes: countForm.notes || undefined
      });

      setMessage(pickLocalized(locale, 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¬Ø±Ø¯ Ø¨Ù†Ø¬Ø§Ø­', 'Stock count created'));
      setCountForm({
        date: todayIsoDate(),
        warehouseId: '',
        notes: ''
      });
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¬Ø±Ø¯', 'Failed to create stock count'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproveCount(id: number) {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await postJson(`/stock-counts/${id}/approve`, {});
      setMessage(pickLocalized(locale, 'ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¬Ø±Ø¯', 'Stock count approved'));
      await loadData();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : pickLocalized(locale, 'ØªØ¹Ø°Ø± Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¬Ø±Ø¯', 'Failed to approve stock count'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!system) {
    return null;
  }

  const warehouseLabel = new Map(data?.bootstrap.warehouses.map((row) => [row.id, row.nameAr]) ?? []);

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
          <span>{pickLocalized(locale, 'الأصناف', 'Items')}</span>
          <strong>{data?.report.summary.items ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي الكمية', 'Total Quantity')}</span>
          <strong>{money(data?.report.summary.totalQty)}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'قيمة المخزون', 'Inventory Value')}</span>
          <strong>{money(data?.report.summary.totalValue)} KWD</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'تحت نقطة الطلب', 'Below Reorder')}</span>
          <strong>{data?.report.summary.belowReorder ?? 0}</strong>
        </article>
      </section>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جاري تحميل بيانات المخزون...', 'Loading inventory data...')}</div> : null}

      <section className="surface split-surface">
        <form className="form-card" onSubmit={handleCreateMovement}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Movement</p>
              <h2>{pickLocalized(locale, 'تسجيل حركة مخزون', 'Record Stock Movement')}</h2>
            </div>
          </div>

          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'التاريخ', 'Date')}</span>
              <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'النوع', 'Type')}</span>
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="RECEIPT">RECEIPT</option>
                <option value="ISSUE">ISSUE</option>
                <option value="TRANSFER">TRANSFER</option>
                <option value="ADJUSTMENT">ADJUSTMENT</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'المرجع', 'Reference')}</span>
              <input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'الصنف', 'Item')}</span>
              <select required value={form.itemId} onChange={(event) => setForm((current) => ({ ...current, itemId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر صنفاً', 'Select item')}</option>
                {data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'المستودع', 'Warehouse')}</span>
              <select required value={form.warehouseId} onChange={(event) => setForm((current) => ({ ...current, warehouseId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر مستودعاً', 'Select warehouse')}</option>
                {data?.bootstrap.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} - {warehouse.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الفرع', 'Branch')}</span>
              <select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'بدون فرع محدد', 'No branch')}</option>
                {data?.bootstrap.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} - {branch.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'المشروع', 'Project')}</span>
              <select value={form.projectId} onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'بدون مشروع', 'No project')}</option>
                {data?.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} - {project.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الكمية', 'Quantity')}</span>
              <input type="number" step="0.001" required value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'تكلفة الوحدة', 'Unit Cost')}</span>
              <input type="number" step="0.001" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
              <input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </div>

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'تسجيل الحركة', 'Record Movement')}
          </button>
        </form>

        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Items</p>
              <h2>{pickLocalized(locale, 'أعلى الأصناف', 'Top Inventory Items')}</h2>
            </div>
          </div>

          <div className="list-grid">
            {data?.report.rows.slice(0, 8).map((item) => (
              <article key={item.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {item.code} - {item.nameAr}
                  </strong>
                  <span className="status-pill">{item.unit?.code || 'UNIT'}</span>
                </div>
                <span className="muted">{item.category?.nameAr || pickLocalized(locale, 'بدون تصنيف', 'Uncategorized')}</span>
                <span>
                  {pickLocalized(locale, 'الرصيد', 'On Hand')}: {money(item.onHandQty)}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'القيمة', 'Value')}: {money(item.inventoryValue)} KWD
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SectionCard title={pickLocalized(locale, 'آخر الحركات', 'Recent Movements')} eyebrow="Stock Ledger">
        <div className="list-grid">
          {data?.report.movements.slice(0, 10).map((movement) => (
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
          {!data?.report.movements.length ? (
            <div className="empty-state">{pickLocalized(locale, 'لا توجد حركات مخزون', 'No inventory movements')}</div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'جرد المخزون', 'Stock Counts')} eyebrow="Cycle Count">
        <section className="surface split-surface">
          <form className="form-card" onSubmit={handleCreateCount}>
            <div className="surface-header">
              <div>
                <p className="eyebrow">Count</p>
                <h2>{pickLocalized(locale, 'إنشاء جرد مخزون', 'Create Stock Count')}</h2>
              </div>
            </div>

            <div className="field-grid">
              <label>
                <span>{pickLocalized(locale, 'التاريخ', 'Date')}</span>
                <input type="date" value={countForm.date} onChange={(event) => setCountForm((current) => ({ ...current, date: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, 'المستودع', 'Warehouse')}</span>
                <select
                  required
                  value={countForm.warehouseId}
                  onChange={(event) => setCountForm((current) => ({ ...current, warehouseId: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, 'اختر مستودعاً', 'Select warehouse')}</option>
                  {data?.bootstrap.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} - {warehouse.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
                <input value={countForm.notes} onChange={(event) => setCountForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء الجرد', 'Create Count')}
            </button>
          </form>

          <div className="list-grid">
            {stockCounts.map((count) => (
              <article key={count.id} className="list-card">
                <div className="list-card-head">
                  <strong>{count.number}</strong>
                  <span className="status-pill">{count.status}</span>
                </div>
                <span className="muted">{shortDate(count.date)}</span>
                <span>
                  {pickLocalized(locale, 'المستودع', 'Warehouse')}: {warehouseLabel.get(count.warehouseId) ?? `#${count.warehouseId}`}
                </span>
                <span className="muted">{count.notes || pickLocalized(locale, 'بدون ملاحظات', 'No notes')}</span>
                {count.status === 'DRAFT' ? (
                  <button type="button" className="ghost-button" onClick={() => handleApproveCount(count.id)} disabled={submitting}>
                    {pickLocalized(locale, 'اعتماد الجرد', 'Approve Count')}
                  </button>
                ) : null}
              </article>
            ))}
            {!stockCounts.length ? (
              <div className="empty-state">{pickLocalized(locale, 'لا توجد جردات مخزون', 'No stock counts')}</div>
            ) : null}
          </div>
        </section>
      </SectionCard>
    </AppShell>
  );
}
