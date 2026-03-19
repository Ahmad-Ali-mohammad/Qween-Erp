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

type AllocationRow = {
  id: number;
  assetId: number;
  projectId?: number | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  hoursUsed?: number | string | null;
  chargeAmount?: number | string | null;
  asset?: AssetRow | null;
  project?: ProjectRow | null;
};

type MaintenanceRow = {
  id: number;
  assetId: number;
  projectId?: number | null;
  type: string;
  status?: string | null;
  serviceDate?: string | null;
  completedAt?: string | null;
  cost?: number | string | null;
  description?: string | null;
  asset?: AssetRow | null;
  project?: ProjectRow | null;
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

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [selectedAllocationId, setSelectedAllocationId] = useState<number | null>(null);
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<number | null>(null);

  const [allocationForm, setAllocationForm] = useState({
    assetId: '',
    projectId: '',
    startDate: new Date().toISOString().slice(0, 10),
    dailyRate: ''
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    assetId: '',
    projectId: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    type: 'PREVENTIVE',
    cost: '',
    description: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, projectsRes, allocationsRes, maintenanceRes] = await Promise.all([
        getJson<AssetRow[] | RowsEnvelope<AssetRow>>('/equipment/assets'),
        getJson<ProjectRow[] | RowsEnvelope<ProjectRow>>('/projects?limit=100'),
        getJson<AllocationRow[] | RowsEnvelope<AllocationRow>>('/equipment/allocations?limit=50'),
        getJson<MaintenanceRow[] | RowsEnvelope<MaintenanceRow>>('/equipment/maintenance?limit=50')
      ]);

      const normalizedAssets = normalizeRows(assetsRes.data);
      const normalizedProjects = normalizeRows(projectsRes.data);
      const normalizedAllocations = normalizeRows(allocationsRes.data);
      const normalizedMaintenance = normalizeRows(maintenanceRes.data);
      setAssets(normalizedAssets);
      setProjects(normalizedProjects);
      setAllocations(normalizedAllocations);
      setMaintenance(normalizedMaintenance);
      setSelectedAllocationId((current) => current ?? normalizedAllocations[0]?.id ?? null);
      setSelectedMaintenanceId((current) => current ?? normalizedMaintenance[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load equipment data');
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

  async function handleCreateAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-allocation');
    setMessage(null);
    setError(null);
    try {
      await postJson<AllocationRow>('/equipment/allocations', {
        assetId: Number(allocationForm.assetId),
        projectId: allocationForm.projectId ? Number(allocationForm.projectId) : undefined,
        startDate: allocationForm.startDate,
        dailyRate: allocationForm.dailyRate ? Number(allocationForm.dailyRate) : undefined
      });
      setAllocationForm({
        assetId: '',
        projectId: '',
        startDate: new Date().toISOString().slice(0, 10),
        dailyRate: ''
      });
      setMessage('Allocation created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create allocation');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-maintenance');
    setMessage(null);
    setError(null);
    try {
      await postJson<MaintenanceRow>('/equipment/maintenance', {
        assetId: Number(maintenanceForm.assetId),
        projectId: maintenanceForm.projectId ? Number(maintenanceForm.projectId) : undefined,
        serviceDate: maintenanceForm.serviceDate,
        type: maintenanceForm.type,
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
        description: maintenanceForm.description || undefined
      });
      setMaintenanceForm({
        assetId: '',
        projectId: '',
        serviceDate: new Date().toISOString().slice(0, 10),
        type: 'PREVENTIVE',
        cost: '',
        description: ''
      });
      setMessage('Maintenance log created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create maintenance log');
    } finally {
      setSubmitting(null);
    }
  }

  async function closeAllocation(id: number) {
    setSubmitting(`close-allocation-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<AllocationRow>(`/equipment/allocations/${id}/close`, {
        endDate: new Date().toISOString().slice(0, 10)
      });
      setMessage('Allocation closed');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to close allocation');
    } finally {
      setSubmitting(null);
    }
  }

  async function completeMaintenance(id: number) {
    setSubmitting(`complete-maintenance-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<MaintenanceRow>(`/equipment/maintenance/${id}/complete`, {
        completedAt: new Date().toISOString().slice(0, 10)
      });
      setMessage('Maintenance completed');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to complete maintenance');
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
      <SectionCard title={pickLocalized(locale, 'Equipment Overview', 'Equipment Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Assets', 'Assets')}</span>
            <strong>{assets.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Allocations', 'Allocations')}</span>
            <strong>{allocations.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Maintenance Logs', 'Maintenance Logs')}</span>
            <strong>{maintenance.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Maintenance Cost', 'Maintenance Cost')}</span>
            <strong>{money(maintenance.reduce((sum, row) => sum + Number(row.cost ?? 0), 0))} KWD</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading equipment data...', 'Loading equipment data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Allocation', 'Create Allocation')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateAllocation}>
          <label>
            <span>{pickLocalized(locale, 'Asset', 'Asset')}</span>
            <select required value={allocationForm.assetId} onChange={(event) => setAllocationForm((current) => ({ ...current, assetId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select asset', 'Select asset')}</option>
              {assets.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code + ' - ' + row.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select value={allocationForm.projectId} onChange={(event) => setAllocationForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No project', 'No project')}</option>
              {projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Start Date', 'Start Date')}</span>
            <input
              type="date"
              required
              value={allocationForm.startDate}
              onChange={(event) => setAllocationForm((current) => ({ ...current, startDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Daily Rate', 'Daily Rate')}</span>
            <input type="number" step="0.001" value={allocationForm.dailyRate} onChange={(event) => setAllocationForm((current) => ({ ...current, dailyRate: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-allocation'}>
            {submitting === 'create-allocation' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Allocation', 'Create Allocation')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Create Maintenance', 'Create Maintenance')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateMaintenance}>
          <label>
            <span>{pickLocalized(locale, 'Asset', 'Asset')}</span>
            <select required value={maintenanceForm.assetId} onChange={(event) => setMaintenanceForm((current) => ({ ...current, assetId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select asset', 'Select asset')}</option>
              {assets.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code + ' - ' + row.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select value={maintenanceForm.projectId} onChange={(event) => setMaintenanceForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No project', 'No project')}</option>
              {projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Service Date', 'Service Date')}</span>
            <input
              type="date"
              required
              value={maintenanceForm.serviceDate}
              onChange={(event) => setMaintenanceForm((current) => ({ ...current, serviceDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Type', 'Type')}</span>
            <input value={maintenanceForm.type} onChange={(event) => setMaintenanceForm((current) => ({ ...current, type: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Cost', 'Cost')}</span>
            <input type="number" step="0.001" value={maintenanceForm.cost} onChange={(event) => setMaintenanceForm((current) => ({ ...current, cost: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Description', 'Description')}</span>
            <input value={maintenanceForm.description} onChange={(event) => setMaintenanceForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-maintenance'}>
            {submitting === 'create-maintenance' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Maintenance', 'Create Maintenance')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Allocations', 'Allocations')} eyebrow="Operations">
        <div className="ui-list">
          {allocations.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{(row.asset?.code ?? `ASSET-${row.assetId}`) + ' / ' + (row.project?.code ?? `PRJ-${row.projectId ?? 0}`)}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'ACTIVE') + ' | ' + shortDate(row.startDate) + ' -> ' + shortDate(row.endDate)} | {money(row.chargeAmount)} KWD
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedAllocationId(row.id)}>
                  {row.id === selectedAllocationId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void closeAllocation(row.id)}
                  disabled={submitting === `close-allocation-${row.id}` || (row.status ?? '').toUpperCase() === 'CLOSED'}
                >
                  {submitting === `close-allocation-${row.id}` ? pickLocalized(locale, 'Closing...', 'Closing...') : pickLocalized(locale, 'Close', 'Close')}
                </button>
              </div>
            </div>
          ))}
          {!allocations.length ? <p className="ui-muted">{pickLocalized(locale, 'No allocations yet', 'No allocations yet')}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Maintenance Logs', 'Maintenance Logs')} eyebrow="Maintenance">
        <div className="ui-list">
          {maintenance.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{(row.asset?.code ?? `ASSET-${row.assetId}`) + ' / ' + row.type}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'OPEN') + ' | ' + shortDate(row.serviceDate)} | {money(row.cost)} KWD
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedMaintenanceId(row.id)}>
                  {row.id === selectedMaintenanceId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void completeMaintenance(row.id)}
                  disabled={submitting === `complete-maintenance-${row.id}` || (row.status ?? '').toUpperCase() === 'COMPLETED'}
                >
                  {submitting === `complete-maintenance-${row.id}` ? pickLocalized(locale, 'Completing...', 'Completing...') : pickLocalized(locale, 'Complete', 'Complete')}
                </button>
              </div>
            </div>
          ))}
          {!maintenance.length ? <p className="ui-muted">{pickLocalized(locale, 'No maintenance logs yet', 'No maintenance logs yet')}</p> : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
