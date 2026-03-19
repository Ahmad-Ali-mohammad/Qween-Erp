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

type RowsEnvelope<T> = {
  rows: T[];
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

type MaintenanceScheduleRow = {
  id: number;
  assetId: number;
  branchId?: number | null;
  projectId?: number | null;
  supplierId?: number | null;
  title?: string | null;
  frequencyUnit?: string | null;
  frequencyValue?: number | null;
  startDate?: string | null;
  nextDueDate?: string | null;
  lastExecutedAt?: string | null;
  status?: string | null;
  notes?: string | null;
  asset?: AssetRow | null;
  project?: ProjectRow | null;
  supplier?: SupplierRow | null;
};

type SparePartRow = {
  id: number;
  itemId: number;
  warehouseId?: number | null;
  quantity?: number | string | null;
  reservedQty?: number | string | null;
  issuedQty?: number | string | null;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
  status?: string | null;
  notes?: string | null;
  item?: { nameAr?: string | null; nameEn?: string | null } | null;
  warehouse?: { nameAr?: string | null; code?: string | null } | null;
};

type MaintenanceWorkOrderRow = {
  id: number;
  scheduleId?: number | null;
  assetId: number;
  branchId?: number | null;
  projectId?: number | null;
  supplierId?: number | null;
  priority?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  cost?: number | string | null;
  description?: string | null;
  notes?: string | null;
  asset?: AssetRow | null;
  project?: ProjectRow | null;
  supplier?: SupplierRow | null;
  schedule?: MaintenanceScheduleRow | null;
  spareParts?: SparePartRow[] | null;
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

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return [];
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [data, setData] = useState<MaintenanceState | null>(null);
  const [schedules, setSchedules] = useState<MaintenanceScheduleRow[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrderRow[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<MaintenanceWorkOrderRow | null>(null);
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
  const [scheduleForm, setScheduleForm] = useState({
    assetId: '',
    branchId: '',
    projectId: '',
    supplierId: '',
    title: '',
    frequencyUnit: 'MONTH',
    frequencyValue: '1',
    startDate: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [workOrderForm, setWorkOrderForm] = useState({
    scheduleId: '',
    assetId: '',
    branchId: '',
    projectId: '',
    supplierId: '',
    priority: 'MEDIUM',
    dueDate: '',
    cost: '',
    description: '',
    notes: ''
  });
  const [sparePartForm, setSparePartForm] = useState({
    itemId: '',
    warehouseId: '',
    quantity: '1',
    unitCost: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [maintenance, assets, projects, suppliers, schedulesResponse, workOrdersResponse] = await Promise.all([
        getJson<MaintenanceRow[] | RowsEnvelope<MaintenanceRow>>('/maintenance?limit=50'),
        getJson<AssetRow[] | RowsEnvelope<AssetRow>>('/assets'),
        getJson<ProjectRow[] | RowsEnvelope<ProjectRow>>('/projects?limit=50'),
        getJson<SupplierRow[] | RowsEnvelope<SupplierRow>>('/suppliers'),
        getJson<MaintenanceScheduleRow[] | RowsEnvelope<MaintenanceScheduleRow>>('/maintenance/schedules?limit=30'),
        getJson<MaintenanceWorkOrderRow[] | RowsEnvelope<MaintenanceWorkOrderRow>>('/maintenance/work-orders?limit=30')
      ]);

      const normalizedMaintenance = normalizeRows(maintenance.data);
      setData({
        maintenance: normalizedMaintenance,
        assets: normalizeRows(assets.data),
        projects: normalizeRows(projects.data),
        suppliers: normalizeRows(suppliers.data)
      });

      const normalizedSchedules = normalizeRows(schedulesResponse.data);
      const normalizedWorkOrders = normalizeRows(workOrdersResponse.data);
      setSchedules(normalizedSchedules);
      setWorkOrders(normalizedWorkOrders);

      if (!selectedLogId && normalizedMaintenance[0]) {
        setSelectedLogId(normalizedMaintenance[0].id);
      }
      if (!selectedWorkOrderId && normalizedWorkOrders[0]) {
        setSelectedWorkOrderId(normalizedWorkOrders[0].id);
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

  async function loadWorkOrderDetail(id: number) {
    try {
      const response = await getJson<MaintenanceWorkOrderRow>(`/maintenance/work-orders/${id}`);
      setSelectedWorkOrder(response.data);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : pickLocalized(locale, 'تعذر تحميل تفاصيل أمر العمل', 'Failed to load work order details')
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

  useEffect(() => {
    if (!selectedWorkOrderId) {
      setSelectedWorkOrder(null);
      return;
    }

    void loadWorkOrderDetail(selectedWorkOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkOrderId]);

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

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('schedule');
    setMessage(null);
    setError(null);

    try {
      await postJson('/maintenance/schedules', {
        assetId: Number(scheduleForm.assetId),
        branchId: scheduleForm.branchId ? Number(scheduleForm.branchId) : undefined,
        projectId: scheduleForm.projectId ? Number(scheduleForm.projectId) : undefined,
        supplierId: scheduleForm.supplierId ? Number(scheduleForm.supplierId) : undefined,
        title: scheduleForm.title || undefined,
        frequencyUnit: scheduleForm.frequencyUnit,
        frequencyValue: scheduleForm.frequencyValue ? Number(scheduleForm.frequencyValue) : undefined,
        startDate: scheduleForm.startDate ? `${scheduleForm.startDate}T00:00:00.000Z` : undefined,
        notes: scheduleForm.notes || undefined
      });

      setScheduleForm({
        assetId: '',
        branchId: '',
        projectId: '',
        supplierId: '',
        title: '',
        frequencyUnit: 'MONTH',
        frequencyValue: '1',
        startDate: new Date().toISOString().slice(0, 10),
        notes: ''
      });
      setMessage(pickLocalized(locale, 'تم إنشاء جدول صيانة بنجاح', 'Maintenance schedule created'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء جدول الصيانة', 'Failed to create maintenance schedule')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('work-order');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<MaintenanceWorkOrderRow>('/maintenance/work-orders', {
        scheduleId: workOrderForm.scheduleId ? Number(workOrderForm.scheduleId) : undefined,
        assetId: workOrderForm.assetId ? Number(workOrderForm.assetId) : undefined,
        branchId: workOrderForm.branchId ? Number(workOrderForm.branchId) : undefined,
        projectId: workOrderForm.projectId ? Number(workOrderForm.projectId) : undefined,
        supplierId: workOrderForm.supplierId ? Number(workOrderForm.supplierId) : undefined,
        priority: workOrderForm.priority || undefined,
        dueDate: workOrderForm.dueDate ? `${workOrderForm.dueDate}T00:00:00.000Z` : undefined,
        cost: workOrderForm.cost ? Number(workOrderForm.cost) : undefined,
        description: workOrderForm.description || undefined,
        notes: workOrderForm.notes || undefined
      });

      setSelectedWorkOrderId(response.data.id);
      setWorkOrderForm({
        scheduleId: '',
        assetId: '',
        branchId: '',
        projectId: '',
        supplierId: '',
        priority: 'MEDIUM',
        dueDate: '',
        cost: '',
        description: '',
        notes: ''
      });
      setMessage(pickLocalized(locale, 'تم إنشاء أمر العمل بنجاح', 'Work order created'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء أمر العمل', 'Failed to create work order')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCompleteWorkOrder() {
    if (!selectedWorkOrderId) return;
    setSubmitting('work-order-complete');
    setMessage(null);
    setError(null);

    try {
      await postJson(`/maintenance/work-orders/${selectedWorkOrderId}/complete`, {});
      setMessage(pickLocalized(locale, 'تم إكمال أمر العمل بنجاح', 'Work order completed'));
      await loadData();
      await loadWorkOrderDetail(selectedWorkOrderId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إكمال أمر العمل', 'Failed to complete work order')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCancelWorkOrder() {
    if (!selectedWorkOrderId) return;
    setSubmitting('work-order-cancel');
    setMessage(null);
    setError(null);

    try {
      await postJson(`/maintenance/work-orders/${selectedWorkOrderId}/cancel`, {});
      setMessage(pickLocalized(locale, 'تم إلغاء أمر العمل', 'Work order cancelled'));
      await loadData();
      await loadWorkOrderDetail(selectedWorkOrderId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إلغاء أمر العمل', 'Failed to cancel work order')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleAddSparePart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkOrderId) return;
    setSubmitting('spare-part');
    setMessage(null);
    setError(null);

    try {
      await postJson(`/maintenance/work-orders/${selectedWorkOrderId}/spare-parts`, {
        itemId: Number(sparePartForm.itemId),
        warehouseId: sparePartForm.warehouseId ? Number(sparePartForm.warehouseId) : undefined,
        quantity: Number(sparePartForm.quantity),
        unitCost: sparePartForm.unitCost ? Number(sparePartForm.unitCost) : undefined
      });
      setSparePartForm({
        itemId: '',
        warehouseId: '',
        quantity: '1',
        unitCost: ''
      });
      setMessage(pickLocalized(locale, 'تم إضافة قطعة الغيار', 'Spare part added'));
      await loadWorkOrderDetail(selectedWorkOrderId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إضافة قطعة الغيار', 'Failed to add spare part')
      );
    } finally {
      setSubmitting(null);
    }
  }

  const openCount = data?.maintenance.filter((row) => row.status !== 'COMPLETED').length ?? 0;
  const completedCount = data?.maintenance.filter((row) => row.status === 'COMPLETED').length ?? 0;
  const totalCost = data?.maintenance.reduce((sum, row) => sum + Number(row.cost ?? 0), 0) ?? 0;
  const workOrderClosed = selectedWorkOrder?.status === 'COMPLETED' || selectedWorkOrder?.status === 'CANCELLED';

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
      <SectionCard title={pickLocalized(locale, '????? ???????', 'Maintenance Schedules')} eyebrow="Planning">
        <section className="surface split-surface">
          <form className="form-card" onSubmit={handleCreateSchedule}>
            <div className="surface-header">
              <div>
                <p className="eyebrow">Planning</p>
                <h2>{pickLocalized(locale, '????? ???? ?????', 'Create Schedule')}</h2>
              </div>
            </div>
            <div className="field-grid">
              <label>
                <span>{pickLocalized(locale, '?????? / ?????', 'Asset')}</span>
                <select required value={scheduleForm.assetId} onChange={(event) => setScheduleForm((current) => ({ ...current, assetId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ????', 'Select asset')}</option>
                  {data?.assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.code} - {asset.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '?????', 'Branch')}</span>
                <input type="number" value={scheduleForm.branchId} onChange={(event) => setScheduleForm((current) => ({ ...current, branchId: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, '???????', 'Project')}</span>
                <select value={scheduleForm.projectId} onChange={(event) => setScheduleForm((current) => ({ ...current, projectId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ?????', 'No project')}</option>
                  {data?.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, '?????', 'Project')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '??????', 'Supplier')}</span>
                <select value={scheduleForm.supplierId} onChange={(event) => setScheduleForm((current) => ({ ...current, supplierId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ????', 'No supplier')}</option>
                  {data?.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code || `SUP-${supplier.id}`} - {supplier.nameAr || pickLocalized(locale, '????', 'Supplier')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '????? ??????', 'Title')}</span>
                <input value={scheduleForm.title} onChange={(event) => setScheduleForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, '??????', 'Frequency Unit')}</span>
                <select value={scheduleForm.frequencyUnit} onChange={(event) => setScheduleForm((current) => ({ ...current, frequencyUnit: event.target.value }))}>
                  <option value="DAY">DAY</option>
                  <option value="WEEK">WEEK</option>
                  <option value="MONTH">MONTH</option>
                  <option value="YEAR">YEAR</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '?????', 'Frequency Value')}</span>
                <input type="number" min="1" value={scheduleForm.frequencyValue} onChange={(event) => setScheduleForm((current) => ({ ...current, frequencyValue: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, '????? ???????', 'Start Date')}</span>
                <input type="date" value={scheduleForm.startDate} onChange={(event) => setScheduleForm((current) => ({ ...current, startDate: event.target.value }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>{pickLocalized(locale, '???????', 'Notes')}</span>
                <input value={scheduleForm.notes} onChange={(event) => setScheduleForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <button type="submit" className="primary-button" disabled={submitting === 'schedule'}>
              {submitting === 'schedule'
                ? pickLocalized(locale, '???? ?????...', 'Saving...')
                : pickLocalized(locale, '??? ??????', 'Save Schedule')}
            </button>
          </form>

          <div className="form-card">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Register</p>
                <h2>{pickLocalized(locale, '??? ???????', 'Schedule Register')}</h2>
              </div>
            </div>
            <div className="list-grid">
              {schedules.map((schedule) => (
                <article key={schedule.id} className="list-card">
                  <div className="list-card-head">
                    <strong>
                      {schedule.asset?.code || `AST-${schedule.assetId}`} - {schedule.asset?.nameAr || pickLocalized(locale, '????', 'Asset')}
                    </strong>
                    <span className="status-pill">{schedule.status || 'ACTIVE'}</span>
                  </div>
                  <span>{schedule.title || pickLocalized(locale, '???? ?????', 'Maintenance Schedule')}</span>
                  <span className="muted">
                    {pickLocalized(locale, '???????', 'Frequency')}: {schedule.frequencyValue || 1} {schedule.frequencyUnit || 'MONTH'}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '????????? ??????', 'Next Due')}: {shortDate(schedule.nextDueDate)}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '??? ?????', 'Last Done')}: {shortDate(schedule.lastExecutedAt)}
                  </span>
                </article>
              ))}
              {!schedules.length ? <div className="empty-state">{pickLocalized(locale, '?? ???? ????? ?????', 'No maintenance schedules')}</div> : null}
            </div>
          </div>
        </section>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, '????? ?????', 'Work Orders')} eyebrow="Execution">
        <section className="surface split-surface">
          <form className="form-card" onSubmit={handleCreateWorkOrder}>
            <div className="surface-header">
              <div>
                <p className="eyebrow">Execution</p>
                <h2>{pickLocalized(locale, '????? ??? ???', 'Create Work Order')}</h2>
              </div>
            </div>
            <div className="field-grid">
              <label>
                <span>{pickLocalized(locale, '??????', 'Schedule')}</span>
                <select value={workOrderForm.scheduleId} onChange={(event) => setWorkOrderForm((current) => ({ ...current, scheduleId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ????', 'No schedule')}</option>
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.id} - {schedule.asset?.code || `AST-${schedule.assetId}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '?????? / ?????', 'Asset')}</span>
                <select
                  required={!workOrderForm.scheduleId}
                  value={workOrderForm.assetId}
                  onChange={(event) => setWorkOrderForm((current) => ({ ...current, assetId: event.target.value }))}
                >
                  <option value="">{pickLocalized(locale, '???? ????', 'Select asset')}</option>
                  {data?.assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.code} - {asset.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '?????', 'Branch')}</span>
                <input type="number" value={workOrderForm.branchId} onChange={(event) => setWorkOrderForm((current) => ({ ...current, branchId: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, '???????', 'Project')}</span>
                <select value={workOrderForm.projectId} onChange={(event) => setWorkOrderForm((current) => ({ ...current, projectId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ?????', 'No project')}</option>
                  {data?.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, '?????', 'Project')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '??????', 'Supplier')}</span>
                <select value={workOrderForm.supplierId} onChange={(event) => setWorkOrderForm((current) => ({ ...current, supplierId: event.target.value }))}>
                  <option value="">{pickLocalized(locale, '???? ????', 'No supplier')}</option>
                  {data?.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code || `SUP-${supplier.id}`} - {supplier.nameAr || pickLocalized(locale, '????', 'Supplier')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '????????', 'Priority')}</span>
                <select value={workOrderForm.priority} onChange={(event) => setWorkOrderForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, '????? ?????????', 'Due Date')}</span>
                <input type="date" value={workOrderForm.dueDate} onChange={(event) => setWorkOrderForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, '???????', 'Cost')}</span>
                <input type="number" step="0.001" value={workOrderForm.cost} onChange={(event) => setWorkOrderForm((current) => ({ ...current, cost: event.target.value }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>{pickLocalized(locale, '?????', 'Description')}</span>
                <input value={workOrderForm.description} onChange={(event) => setWorkOrderForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>{pickLocalized(locale, '???????', 'Notes')}</span>
                <input value={workOrderForm.notes} onChange={(event) => setWorkOrderForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <button type="submit" className="primary-button" disabled={submitting === 'work-order'}>
              {submitting === 'work-order'
                ? pickLocalized(locale, '???? ?????...', 'Saving...')
                : pickLocalized(locale, '??? ??? ?????', 'Save Work Order')}
            </button>
          </form>

          <div className="form-card">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Register</p>
                <h2>{pickLocalized(locale, '??? ????? ?????', 'Work Order Register')}</h2>
              </div>
            </div>
            <div className="list-grid">
              {workOrders.map((order) => (
                <article key={order.id} className="list-card">
                  <div className="list-card-head">
                    <strong>
                      {order.asset?.code || `AST-${order.assetId}`} - {order.asset?.nameAr || pickLocalized(locale, '????', 'Asset')}
                    </strong>
                    <span className="status-pill">{order.status || 'OPEN'}</span>
                  </div>
                  <span>{pickLocalized(locale, '????????', 'Priority')}: {order.priority || 'MEDIUM'}</span>
                  <span className="muted">
                    {pickLocalized(locale, '?????????', 'Due')}: {shortDate(order.dueDate)}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '???????', 'Cost')}: {money(order.cost)} KWD
                  </span>
                  <button type="button" className="ghost-button" onClick={() => setSelectedWorkOrderId(order.id)}>
                    {pickLocalized(locale, '??? ????????', 'View Details')}
                  </button>
                </article>
              ))}
              {!workOrders.length ? <div className="empty-state">{pickLocalized(locale, '?? ???? ????? ???', 'No work orders')}</div> : null}
            </div>
          </div>
        </section>

        {selectedWorkOrder ? (
          <section className="surface split-surface">
            <div className="form-card">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Details</p>
                  <h2>{pickLocalized(locale, '?????? ??? ?????', 'Work Order Details')}</h2>
                </div>
                <div className="ui-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleCompleteWorkOrder()}
                    disabled={submitting === 'work-order-complete' || workOrderClosed}
                  >
                    {submitting === 'work-order-complete'
                      ? pickLocalized(locale, '???? ???????...', 'Completing...')
                      : pickLocalized(locale, '????? ??? ?????', 'Complete Work Order')}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleCancelWorkOrder()}
                    disabled={submitting === 'work-order-cancel' || workOrderClosed}
                  >
                    {submitting === 'work-order-cancel'
                      ? pickLocalized(locale, '???? ???????...', 'Cancelling...')
                      : pickLocalized(locale, '????? ??? ?????', 'Cancel Work Order')}
                  </button>
                </div>
              </div>
              <div className="list-grid">
                <article className="list-card">
                  <div className="list-card-head">
                    <strong>
                      {selectedWorkOrder.asset?.code || `AST-${selectedWorkOrder.assetId}`} -{' '}
                      {selectedWorkOrder.asset?.nameAr || pickLocalized(locale, '????', 'Asset')}
                    </strong>
                    <span className="status-pill">{selectedWorkOrder.status || 'OPEN'}</span>
                  </div>
                  <span>{pickLocalized(locale, '????????', 'Priority')}: {selectedWorkOrder.priority || 'MEDIUM'}</span>
                  <span className="muted">
                    {pickLocalized(locale, '??????', 'Schedule')}: {selectedWorkOrder.schedule?.id || '-'}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '???????', 'Project')}: {selectedWorkOrder.project?.code || '-'} {selectedWorkOrder.project?.nameAr || ''}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '??????', 'Supplier')}: {selectedWorkOrder.supplier?.code || '-'} {selectedWorkOrder.supplier?.nameAr || ''}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '????? ?????????', 'Due Date')}: {shortDate(selectedWorkOrder.dueDate)}
                  </span>
                  <span className="muted">
                    {pickLocalized(locale, '????? ???????', 'Completed At')}: {shortDate(selectedWorkOrder.completedAt)}
                  </span>
                  <span>
                    {pickLocalized(locale, '???????', 'Cost')}: {money(selectedWorkOrder.cost)} KWD
                  </span>
                  <span className="muted">
                    {selectedWorkOrder.description || pickLocalized(locale, '???? ???', 'No description')}
                  </span>
                </article>
              </div>
            </div>

            <form className="form-card" onSubmit={handleAddSparePart}>
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Spare Parts</p>
                  <h2>{pickLocalized(locale, '????? ??? ??????', 'Add Spare Parts')}</h2>
                </div>
              </div>
              <div className="field-grid">
                <label>
                  <span>{pickLocalized(locale, '??? ?????', 'Item ID')}</span>
                  <input required value={sparePartForm.itemId} onChange={(event) => setSparePartForm((current) => ({ ...current, itemId: event.target.value }))} />
                </label>
                <label>
                  <span>{pickLocalized(locale, '??? ????????', 'Warehouse ID')}</span>
                  <input value={sparePartForm.warehouseId} onChange={(event) => setSparePartForm((current) => ({ ...current, warehouseId: event.target.value }))} />
                </label>
                <label>
                  <span>{pickLocalized(locale, '??????', 'Quantity')}</span>
                  <input type="number" min="1" value={sparePartForm.quantity} onChange={(event) => setSparePartForm((current) => ({ ...current, quantity: event.target.value }))} />
                </label>
                <label>
                  <span>{pickLocalized(locale, '????? ??????', 'Unit Cost')}</span>
                  <input type="number" step="0.001" value={sparePartForm.unitCost} onChange={(event) => setSparePartForm((current) => ({ ...current, unitCost: event.target.value }))} />
                </label>
              </div>
              <button type="submit" className="primary-button" disabled={submitting === 'spare-part'}>
                {submitting === 'spare-part'
                  ? pickLocalized(locale, '???? ???????...', 'Adding...')
                  : pickLocalized(locale, '????? ???? ????', 'Add Spare Part')}
              </button>
              <div className="list-grid" style={{ marginTop: '1rem' }}>
                {(selectedWorkOrder.spareParts ?? []).map((part) => (
                  <article key={part.id} className="list-card">
                    <div className="list-card-head">
                      <strong>{part.item?.nameAr || part.item?.nameEn || `ITEM-${part.itemId}`}</strong>
                      <span className="status-pill">{part.status || 'RESERVED'}</span>
                    </div>
                    <span className="muted">
                      {pickLocalized(locale, '??????', 'Quantity')}: {Number(part.quantity ?? 0).toLocaleString()}
                    </span>
                    <span className="muted">
                      {pickLocalized(locale, '????????', 'Warehouse')}: {part.warehouse?.nameAr || part.warehouse?.code || '-'}
                    </span>
                    <span>
                      {pickLocalized(locale, '??????? ?????????', 'Total Cost')}: {money(part.totalCost)} KWD
                    </span>
                  </article>
                ))}
                {!selectedWorkOrder.spareParts?.length ? <div className="empty-state">{pickLocalized(locale, '?? ???? ??? ????', 'No spare parts')}</div> : null}
              </div>
            </form>
          </section>
        ) : (
          <div className="empty-state">{pickLocalized(locale, '???? ??? ??? ???? ????????', 'Select a work order to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
