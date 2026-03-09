import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type AssetRow = {
  id: number;
  code: string;
  nameAr: string;
  status?: string | null;
};

type ProjectRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type SupplierRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type MaintenanceRow = {
  id: number;
  assetId: number;
  projectId?: number | null;
  supplierId?: number | null;
  type: string;
  status: string;
  serviceDate?: string | null;
  completedAt?: string | null;
  cost?: number | string | null;
  description?: string | null;
  notes?: string | null;
  asset?: AssetRow | null;
  project?: ProjectRow | null;
  supplier?: SupplierRow | null;
};

type MaintenanceState = {
  maintenance: MaintenanceRow[];
  assets: AssetRow[];
  projects: ProjectRow[];
  suppliers: SupplierRow[];
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function shortDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [data, setData] = useState<MaintenanceState | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedLog, setSelectedLog] = useState<MaintenanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    assetId: '',
    projectId: '',
    supplierId: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    type: 'PREVENTIVE',
    cost: '',
    description: ''
  });
  const [completeForm, setCompleteForm] = useState({
    completedAt: new Date().toISOString().slice(0, 10),
    cost: '',
    notes: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [maintenance, assets, projects, suppliers] = await Promise.all([
        getJson<MaintenanceRow[]>('/maintenance?limit=50'),
        getJson<AssetRow[]>('/assets'),
        getJson<ProjectRow[]>('/projects?limit=50'),
        getJson<SupplierRow[]>('/suppliers')
      ]);

      setData({
        maintenance: maintenance.data,
        assets: assets.data,
        projects: projects.data,
        suppliers: suppliers.data
      });

      if (!selectedLogId && maintenance.data[0]) {
        setSelectedLogId(maintenance.data[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل سجلات الصيانة', 'Failed to load maintenance logs')
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadMaintenanceDetail(id: number) {
    try {
      const response = await getJson<MaintenanceRow>(`/maintenance/${id}`);
      setSelectedLog(response.data);
      setCompleteForm((current) => ({
        ...current,
        cost: response.data.cost ? String(response.data.cost) : '',
        notes: response.data.notes || ''
      }));
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : pickLocalized(locale, 'تعذر تحميل تفاصيل الصيانة', 'Failed to load maintenance details')
      );
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedLogId) {
      setSelectedLog(null);
      return;
    }

    void loadMaintenanceDetail(selectedLogId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLogId]);

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

  async function handleCreateMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<MaintenanceRow>('/maintenance', {
        assetId: Number(createForm.assetId),
        projectId: createForm.projectId ? Number(createForm.projectId) : undefined,
        supplierId: createForm.supplierId ? Number(createForm.supplierId) : undefined,
        serviceDate: createForm.serviceDate ? `${createForm.serviceDate}T00:00:00.000Z` : undefined,
        type: createForm.type,
        cost: createForm.cost ? Number(createForm.cost) : undefined,
        description: createForm.description || undefined
      });

      setSelectedLogId(response.data.id);
      setCreateForm({
        assetId: '',
        projectId: '',
        supplierId: '',
        serviceDate: new Date().toISOString().slice(0, 10),
        type: 'PREVENTIVE',
        cost: '',
        description: ''
      });
      setMessage(pickLocalized(locale, 'تم إنشاء سجل الصيانة بنجاح', 'Maintenance log created successfully'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء سجل الصيانة', 'Failed to create maintenance log')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCompleteMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLogId) return;

    setSubmitting('complete');
    setMessage(null);
    setError(null);

    try {
      await postJson<MaintenanceRow>(`/maintenance/${selectedLogId}/complete`, {
        completedAt: completeForm.completedAt ? `${completeForm.completedAt}T00:00:00.000Z` : undefined,
        cost: completeForm.cost ? Number(completeForm.cost) : undefined,
        notes: completeForm.notes || undefined
      });

      setMessage(pickLocalized(locale, 'تم إكمال الصيانة بنجاح', 'Maintenance completed successfully'));
      await loadData();
      await loadMaintenanceDetail(selectedLogId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إكمال الصيانة', 'Failed to complete maintenance')
      );
    } finally {
      setSubmitting(null);
    }
  }

  const openCount = data?.maintenance.filter((row) => row.status !== 'COMPLETED').length ?? 0;
  const completedCount = data?.maintenance.filter((row) => row.status === 'COMPLETED').length ?? 0;
  const totalCost = data?.maintenance.reduce((sum, row) => sum + Number(row.cost ?? 0), 0) ?? 0;

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
          <button type="button" className="ui-link" onClick={() => void loadData()}>
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
          <span>{pickLocalized(locale, 'سجلات مفتوحة', 'Open Logs')}</span>
          <strong>{openCount}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'سجلات مكتملة', 'Completed Logs')}</span>
          <strong>{completedCount}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي التكلفة', 'Total Cost')}</span>
          <strong>{money(totalCost)} KWD</strong>
        </article>
      </section>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جارٍ تحميل بيانات الصيانة...', 'Loading maintenance data...')}</div> : null}

      <section className="surface split-surface">
        <form className="form-card" onSubmit={handleCreateMaintenance}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Maintenance</p>
              <h2>{pickLocalized(locale, 'تسجيل صيانة جديدة', 'Register Maintenance')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'المعدة / الأصل', 'Asset')}</span>
              <select required value={createForm.assetId} onChange={(event) => setCreateForm((current) => ({ ...current, assetId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر معدة', 'Select asset')}</option>
                {data?.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} - {asset.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'المشروع', 'Project')}</span>
              <select value={createForm.projectId} onChange={(event) => setCreateForm((current) => ({ ...current, projectId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'بدون مشروع', 'No project')}</option>
                {data?.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, 'مشروع', 'Project')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'المورد', 'Supplier')}</span>
              <select value={createForm.supplierId} onChange={(event) => setCreateForm((current) => ({ ...current, supplierId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'بدون مورد', 'No supplier')}</option>
                {data?.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.code || `SUP-${supplier.id}`} - {supplier.nameAr || pickLocalized(locale, 'مورد', 'Supplier')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ الخدمة', 'Service Date')}</span>
              <input type="date" required value={createForm.serviceDate} onChange={(event) => setCreateForm((current) => ({ ...current, serviceDate: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'نوع الصيانة', 'Type')}</span>
              <select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="PREVENTIVE">PREVENTIVE</option>
                <option value="CORRECTIVE">CORRECTIVE</option>
                <option value="BREAKDOWN">BREAKDOWN</option>
                <option value="INSPECTION">INSPECTION</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'التكلفة التقديرية', 'Estimated Cost')}</span>
              <input type="number" step="0.001" value={createForm.cost} onChange={(event) => setCreateForm((current) => ({ ...current, cost: event.target.value }))} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span>{pickLocalized(locale, 'الوصف', 'Description')}</span>
              <input value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'create'}>
            {submitting === 'create'
              ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...')
              : pickLocalized(locale, 'إنشاء سجل الصيانة', 'Create Maintenance')}
          </button>
        </form>

        <div className="form-card">
          <div className="surface-header">
            <div>
              <p className="eyebrow">Maintenance Register</p>
              <h2>{pickLocalized(locale, 'سجل الصيانة', 'Maintenance Register')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {data?.maintenance.map((row) => (
              <article key={row.id} className="list-card">
                <div className="list-card-head">
                  <strong>
                    {row.asset?.code || `AST-${row.assetId}`} - {row.asset?.nameAr || pickLocalized(locale, 'أصل', 'Asset')}
                  </strong>
                  <span className="status-pill">{row.status}</span>
                </div>
                <span>{row.type}</span>
                <span className="muted">{shortDate(row.serviceDate)}</span>
                <span className="muted">
                  {pickLocalized(locale, 'التكلفة', 'Cost')}: {money(row.cost)} KWD
                </span>
                <button type="button" className="ghost-button" onClick={() => setSelectedLogId(row.id)}>
                  {pickLocalized(locale, 'عرض التفاصيل', 'View Details')}
                </button>
              </article>
            ))}
            {!data?.maintenance.length ? (
              <div className="empty-state">{pickLocalized(locale, 'لا توجد سجلات صيانة', 'No maintenance logs')}</div>
            ) : null}
          </div>
        </div>
      </section>

      <SectionCard title={pickLocalized(locale, 'تفاصيل الصيانة', 'Maintenance Details')} eyebrow="Detail">
        {selectedLog ? (
          <section className="surface split-surface">
            <div className="list-grid">
              <article className="list-card">
                <div className="list-card-head">
                  <strong>
                    {selectedLog.asset?.code || `AST-${selectedLog.assetId}`} -{' '}
                    {selectedLog.asset?.nameAr || pickLocalized(locale, 'أصل', 'Asset')}
                  </strong>
                  <span className="status-pill">{selectedLog.status}</span>
                </div>
                <span>{pickLocalized(locale, 'نوع الصيانة', 'Type')}: {selectedLog.type}</span>
                <span className="muted">
                  {pickLocalized(locale, 'المشروع', 'Project')}: {selectedLog.project?.code || '-'} {selectedLog.project?.nameAr || ''}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'المورد', 'Supplier')}: {selectedLog.supplier?.code || '-'} {selectedLog.supplier?.nameAr || ''}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'تاريخ الخدمة', 'Service Date')}: {shortDate(selectedLog.serviceDate)}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'الإكمال', 'Completed')}: {shortDate(selectedLog.completedAt)}
                </span>
                <span>
                  {pickLocalized(locale, 'التكلفة', 'Cost')}: {money(selectedLog.cost)} KWD
                </span>
                <span className="muted">{selectedLog.description || pickLocalized(locale, 'بدون وصف', 'No description')}</span>
              </article>
            </div>

            <form className="form-card" onSubmit={handleCompleteMaintenance}>
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Workflow</p>
                  <h2>{pickLocalized(locale, 'إكمال الصيانة', 'Complete Maintenance')}</h2>
                </div>
              </div>
              <div className="field-grid">
                <label>
                  <span>{pickLocalized(locale, 'تاريخ الإكمال', 'Completion Date')}</span>
                  <input
                    type="date"
                    value={completeForm.completedAt}
                    onChange={(event) => setCompleteForm((current) => ({ ...current, completedAt: event.target.value }))}
                    disabled={selectedLog.status === 'COMPLETED'}
                  />
                </label>
                <label>
                  <span>{pickLocalized(locale, 'التكلفة النهائية', 'Final Cost')}</span>
                  <input
                    type="number"
                    step="0.001"
                    value={completeForm.cost}
                    onChange={(event) => setCompleteForm((current) => ({ ...current, cost: event.target.value }))}
                    disabled={selectedLog.status === 'COMPLETED'}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
                  <input
                    value={completeForm.notes}
                    onChange={(event) => setCompleteForm((current) => ({ ...current, notes: event.target.value }))}
                    disabled={selectedLog.status === 'COMPLETED'}
                  />
                </label>
              </div>
              <button type="submit" className="primary-button" disabled={submitting === 'complete' || selectedLog.status === 'COMPLETED'}>
                {selectedLog.status === 'COMPLETED'
                  ? pickLocalized(locale, 'تم الإكمال', 'Already Completed')
                  : submitting === 'complete'
                    ? pickLocalized(locale, 'جارٍ الإكمال...', 'Completing...')
                    : pickLocalized(locale, 'إكمال الصيانة', 'Complete Maintenance')}
              </button>
            </form>
          </section>
        ) : (
          <div className="empty-state">{pickLocalized(locale, 'اختر سجل صيانة لعرض التفاصيل', 'Select a maintenance log to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
