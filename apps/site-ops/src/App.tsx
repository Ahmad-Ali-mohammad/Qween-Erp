import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type SimpleRef = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type ItemRef = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
  onHandQty?: number | string | null;
};

type AssetRef = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type ReferenceData = {
  branches: SimpleRef[];
  sites: SimpleRef[];
  projects: SimpleRef[];
  warehouses: SimpleRef[];
  items: ItemRef[];
  assets: AssetRef[];
  tasks: Array<{ id: number; projectId: number; title: string }>;
};

type DailyLogRow = {
  id: number;
  projectId: number;
  logDate?: string | null;
  weather?: string | null;
  progressSummary?: string | null;
};

type MaterialRequestRow = {
  id: number;
  number?: string | null;
  projectId: number;
  warehouseId?: number | null;
  status?: string | null;
  requestDate?: string | null;
};

type ProgressRow = {
  id: number;
  projectId: number;
  entryDate?: string | null;
  progressPercent?: number | string | null;
  description?: string | null;
};

type IssueRow = {
  id: number;
  assetId: number;
  projectId?: number | null;
  title: string;
  severity?: string | null;
  status?: string | null;
  issueDate?: string | null;
};

type RowsEnvelope<T> = {
  rows: T[];
};

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

  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLogRow[]>([]);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequestRow[]>([]);
  const [progressEntries, setProgressEntries] = useState<ProgressRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);

  const [dailyLogForm, setDailyLogForm] = useState({
    projectId: '',
    logDate: new Date().toISOString().slice(0, 10),
    weather: 'Sunny',
    progressSummary: ''
  });

  const [materialForm, setMaterialForm] = useState({
    projectId: '',
    warehouseId: '',
    itemId: '',
    quantity: '1',
    neededBy: ''
  });

  const [issueForm, setIssueForm] = useState({
    projectId: '',
    assetId: '',
    severity: 'MEDIUM',
    title: '',
    description: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [refRes, logsRes, requestsRes, progressRes, issuesRes] = await Promise.all([
        getJson<ReferenceData>('/site/reference-data'),
        getJson<DailyLogRow[] | RowsEnvelope<DailyLogRow>>('/site/daily-logs?limit=30'),
        getJson<MaterialRequestRow[] | RowsEnvelope<MaterialRequestRow>>('/site/material-requests?limit=30'),
        getJson<ProgressRow[] | RowsEnvelope<ProgressRow>>('/site/progress?limit=30'),
        getJson<IssueRow[] | RowsEnvelope<IssueRow>>('/site/equipment-issues?limit=30')
      ]);

      setReference(refRes.data);
      setDailyLogs(normalizeRows(logsRes.data));
      setMaterialRequests(normalizeRows(requestsRes.data));
      setProgressEntries(normalizeRows(progressRes.data));
      setIssues(normalizeRows(issuesRes.data));
      setDailyLogForm((current) => ({
        ...current,
        projectId: current.projectId || String(refRes.data.projects[0]?.id ?? '')
      }));
      setMaterialForm((current) => ({
        ...current,
        projectId: current.projectId || String(refRes.data.projects[0]?.id ?? ''),
        warehouseId: current.warehouseId || String(refRes.data.warehouses[0]?.id ?? ''),
        itemId: current.itemId || String(refRes.data.items[0]?.id ?? '')
      }));
      setIssueForm((current) => ({
        ...current,
        projectId: current.projectId || String(refRes.data.projects[0]?.id ?? ''),
        assetId: current.assetId || String(refRes.data.assets[0]?.id ?? '')
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load site operations data');
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

  async function handleCreateDailyLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-log');
    setMessage(null);
    setError(null);
    try {
      await postJson<DailyLogRow>('/site/daily-log', {
        projectId: Number(dailyLogForm.projectId),
        logDate: dailyLogForm.logDate,
        weather: dailyLogForm.weather,
        progressSummary: dailyLogForm.progressSummary || undefined
      });
      setDailyLogForm((current) => ({ ...current, progressSummary: '' }));
      setMessage('Daily log recorded');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create daily log');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateMaterialRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-material');
    setMessage(null);
    setError(null);
    try {
      await postJson<MaterialRequestRow>('/site/material-requests', {
        projectId: Number(materialForm.projectId),
        warehouseId: materialForm.warehouseId ? Number(materialForm.warehouseId) : undefined,
        neededBy: materialForm.neededBy || undefined,
        lines: [
          {
            itemId: Number(materialForm.itemId),
            quantity: Number(materialForm.quantity)
          }
        ]
      });
      setMaterialForm((current) => ({ ...current, quantity: '1', neededBy: '' }));
      setMessage('Material request created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create material request');
    } finally {
      setSubmitting(null);
    }
  }

  async function approveMaterialRequest(id: number) {
    setSubmitting(`approve-request-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<MaterialRequestRow>(`/site/material-requests/${id}/approve`, {});
      setMessage('Material request approved');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to approve material request');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-issue');
    setMessage(null);
    setError(null);
    try {
      await postJson<IssueRow>('/site/equipment-issues', {
        projectId: issueForm.projectId ? Number(issueForm.projectId) : undefined,
        assetId: Number(issueForm.assetId),
        severity: issueForm.severity,
        title: issueForm.title,
        description: issueForm.description || undefined
      });
      setIssueForm((current) => ({ ...current, title: '', description: '' }));
      setMessage('Equipment issue reported');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to report equipment issue');
    } finally {
      setSubmitting(null);
    }
  }

  async function resolveIssue(id: number) {
    setSubmitting(`resolve-issue-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<IssueRow>(`/site/equipment-issues/${id}/resolve`, {
        resolutionNotes: 'Resolved from Site Ops app'
      });
      setMessage('Equipment issue resolved');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to resolve issue');
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
      <SectionCard title={pickLocalized(locale, 'Site Ops Overview', 'Site Ops Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Daily Logs', 'Daily Logs')}</span>
            <strong>{dailyLogs.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Material Requests', 'Material Requests')}</span>
            <strong>{materialRequests.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Progress Updates', 'Progress Updates')}</span>
            <strong>{progressEntries.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Equipment Issues', 'Equipment Issues')}</span>
            <strong>{issues.length}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading site operations data...', 'Loading site operations data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Daily Log', 'Create Daily Log')} eyebrow="Daily">
        <form className="ui-form" onSubmit={handleCreateDailyLog}>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select required value={dailyLogForm.projectId} onChange={(event) => setDailyLogForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select project', 'Select project')}</option>
              {reference?.projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Log Date', 'Log Date')}</span>
            <input type="date" required value={dailyLogForm.logDate} onChange={(event) => setDailyLogForm((current) => ({ ...current, logDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Weather', 'Weather')}</span>
            <input value={dailyLogForm.weather} onChange={(event) => setDailyLogForm((current) => ({ ...current, weather: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Progress Summary', 'Progress Summary')}</span>
            <input value={dailyLogForm.progressSummary} onChange={(event) => setDailyLogForm((current) => ({ ...current, progressSummary: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-log'}>
            {submitting === 'create-log' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Daily Log', 'Create Daily Log')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Create Material Request', 'Create Material Request')} eyebrow="Materials">
        <form className="ui-form" onSubmit={handleCreateMaterialRequest}>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select required value={materialForm.projectId} onChange={(event) => setMaterialForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select project', 'Select project')}</option>
              {reference?.projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Warehouse', 'Warehouse')}</span>
            <select value={materialForm.warehouseId} onChange={(event) => setMaterialForm((current) => ({ ...current, warehouseId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No warehouse', 'No warehouse')}</option>
              {reference?.warehouses.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `WH-${row.id}`) + ' - ' + (row.nameAr ?? 'Warehouse')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Item', 'Item')}</span>
            <select required value={materialForm.itemId} onChange={(event) => setMaterialForm((current) => ({ ...current, itemId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select item', 'Select item')}</option>
              {reference?.items.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `ITM-${row.id}`) + ' - ' + (row.nameAr ?? 'Item')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Quantity', 'Quantity')}</span>
            <input type="number" step="0.001" required value={materialForm.quantity} onChange={(event) => setMaterialForm((current) => ({ ...current, quantity: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Needed By', 'Needed By')}</span>
            <input type="date" value={materialForm.neededBy} onChange={(event) => setMaterialForm((current) => ({ ...current, neededBy: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-material'}>
            {submitting === 'create-material' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Material Request', 'Create Material Request')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Report Equipment Issue', 'Report Equipment Issue')} eyebrow="Issues">
        <form className="ui-form" onSubmit={handleCreateIssue}>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select value={issueForm.projectId} onChange={(event) => setIssueForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No project', 'No project')}</option>
              {reference?.projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Asset', 'Asset')}</span>
            <select required value={issueForm.assetId} onChange={(event) => setIssueForm((current) => ({ ...current, assetId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'Select asset', 'Select asset')}</option>
              {reference?.assets.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `AST-${row.id}`) + ' - ' + (row.nameAr ?? 'Asset')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Severity', 'Severity')}</span>
            <select value={issueForm.severity} onChange={(event) => setIssueForm((current) => ({ ...current, severity: event.target.value }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Title', 'Title')}</span>
            <input required value={issueForm.title} onChange={(event) => setIssueForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Description', 'Description')}</span>
            <input value={issueForm.description} onChange={(event) => setIssueForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-issue'}>
            {submitting === 'create-issue' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Report Issue', 'Report Issue')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Live Site Activity', 'Live Site Activity')} eyebrow="Activity">
        <div className="ui-grid">
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Daily Logs', 'Daily Logs')}</p>
            <div className="ui-list">
              {dailyLogs.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{`PRJ-${row.projectId}`}</strong>
                    <p className="ui-muted">{shortDate(row.logDate)} | {row.weather ?? '-'}</p>
                  </div>
                </div>
              ))}
              {!dailyLogs.length ? <p className="ui-muted">{pickLocalized(locale, 'No daily logs yet', 'No daily logs yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Material Requests', 'Material Requests')}</p>
            <div className="ui-list">
              {materialRequests.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.number ?? `MR-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + shortDate(row.requestDate)}</p>
                  </div>
                  <button type="button" className="ui-button" onClick={() => void approveMaterialRequest(row.id)} disabled={submitting === `approve-request-${row.id}`}>
                    {submitting === `approve-request-${row.id}` ? pickLocalized(locale, 'Approving...', 'Approving...') : pickLocalized(locale, 'Approve', 'Approve')}
                  </button>
                </div>
              ))}
              {!materialRequests.length ? <p className="ui-muted">{pickLocalized(locale, 'No material requests yet', 'No material requests yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Equipment Issues', 'Equipment Issues')}</p>
            <div className="ui-list">
              {issues.slice(0, 8).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.title}</strong>
                    <p className="ui-muted">{(row.status ?? 'OPEN') + ' | ' + (row.severity ?? 'MEDIUM') + ' | ' + shortDate(row.issueDate)}</p>
                  </div>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => void resolveIssue(row.id)}
                    disabled={submitting === `resolve-issue-${row.id}` || (row.status ?? '').toUpperCase() === 'RESOLVED'}
                  >
                    {submitting === `resolve-issue-${row.id}` ? pickLocalized(locale, 'Resolving...', 'Resolving...') : pickLocalized(locale, 'Resolve', 'Resolve')}
                  </button>
                </div>
              ))}
              {!issues.length ? <p className="ui-muted">{pickLocalized(locale, 'No issues yet', 'No issues yet')}</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
