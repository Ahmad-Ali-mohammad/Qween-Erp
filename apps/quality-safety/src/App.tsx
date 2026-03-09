import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type ProjectRef = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type AssetRef = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
  status?: string | null;
};

type ReferenceData = {
  projects: ProjectRef[];
  assets: AssetRef[];
};

type InspectionRow = {
  id: number;
  projectId: number;
  logDate: string;
  progressSummary?: string | null;
  issues?: string | null;
  notes?: string | null;
  project?: ProjectRef | null;
};

type IncidentRow = {
  id: number;
  projectId?: number | null;
  assetId: number;
  title: string;
  description?: string | null;
  severity?: string | null;
  status?: string | null;
  issueDate?: string | null;
  resolvedAt?: string | null;
  project?: ProjectRef | null;
  asset?: AssetRef | null;
};

type SafetyReport = {
  total: number;
  open: number;
  resolved: number;
  bySeverity: {
    high: number;
    medium: number;
    low: number;
  };
};

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

  const [referenceData, setReferenceData] = useState<ReferenceData>({
    projects: [],
    assets: []
  });
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);

  const [inspectionForm, setInspectionForm] = useState({
    projectId: '',
    logDate: new Date().toISOString().slice(0, 10),
    progressSummary: '',
    issues: '',
    notes: ''
  });
  const [incidentForm, setIncidentForm] = useState({
    projectId: '',
    assetId: '',
    title: '',
    issueDate: new Date().toISOString().slice(0, 10),
    severity: 'HIGH',
    description: ''
  });
  const [resolveNotes, setResolveNotes] = useState('');

  const selectedIncident = incidents.find((row) => row.id === selectedIncidentId) ?? null;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [inspectionRes, incidentsRes, reportRes, refsRes] = await Promise.all([
        getJson<InspectionRow[]>('/quality/inspections?limit=20'),
        getJson<IncidentRow[]>('/safety/incidents?limit=30'),
        getJson<SafetyReport>('/safety/reports'),
        getJson<ReferenceData>('/site/reference-data')
      ]);

      setInspections(inspectionRes.data);
      setIncidents(incidentsRes.data);
      setReport(reportRes.data);
      setReferenceData({
        projects: refsRes.data.projects ?? [],
        assets: refsRes.data.assets ?? []
      });

      const openIncident = incidentsRes.data.find((row) => row.status !== 'RESOLVED');
      setSelectedIncidentId(openIncident?.id ?? incidentsRes.data[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل بيانات الجودة والسلامة', 'Failed to load quality and safety data')
      );
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

  async function handleCreateInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('inspection');
    setError(null);
    setMessage(null);

    try {
      await postJson<InspectionRow>('/quality/inspections', {
        projectId: Number(inspectionForm.projectId),
        logDate: inspectionForm.logDate,
        progressSummary: inspectionForm.progressSummary || undefined,
        issues: inspectionForm.issues || undefined,
        notes: inspectionForm.notes || undefined
      });

      setInspectionForm((current) => ({
        ...current,
        progressSummary: '',
        issues: '',
        notes: ''
      }));
      setMessage(pickLocalized(locale, 'تم تسجيل فحص الجودة بنجاح', 'Inspection created successfully'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تسجيل فحص الجودة', 'Failed to create inspection')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('incident');
    setError(null);
    setMessage(null);

    try {
      await postJson<IncidentRow>('/safety/incidents', {
        projectId: incidentForm.projectId ? Number(incidentForm.projectId) : undefined,
        assetId: Number(incidentForm.assetId),
        title: incidentForm.title,
        issueDate: incidentForm.issueDate,
        severity: incidentForm.severity,
        description: incidentForm.description || undefined
      });

      setIncidentForm((current) => ({
        ...current,
        title: '',
        description: '',
        severity: 'HIGH'
      }));
      setMessage(pickLocalized(locale, 'تم تسجيل حادث السلامة بنجاح', 'Incident created successfully'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تسجيل حادث السلامة', 'Failed to create incident')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleResolveIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIncidentId) return;

    setSubmitting('resolve');
    setError(null);
    setMessage(null);

    try {
      await postJson<IncidentRow>(`/safety/incidents/${selectedIncidentId}/resolve`, {
        resolutionNotes: resolveNotes || undefined
      });

      setResolveNotes('');
      setMessage(pickLocalized(locale, 'تم إغلاق الحادث بنجاح', 'Incident resolved successfully'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إغلاق الحادث', 'Failed to resolve incident')
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) {
    return null;
  }

  const openIncidents = incidents.filter((row) => row.status !== 'RESOLVED').length;

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
      <SectionCard title={pickLocalized(locale, 'لوحة الجودة والسلامة', 'Quality & Safety Dashboard')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'إجمالي الحوادث', 'Total Incidents')}</span>
            <strong>{report?.total ?? 0}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'حوادث مفتوحة', 'Open Incidents')}</span>
            <strong>{report?.open ?? openIncidents}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'فحوصات الجودة', 'Inspections')}</span>
            <strong>{inspections.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'حوادث عالية الخطورة', 'High Severity')}</span>
            <strong>{report?.bySeverity.high ?? 0}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل البيانات...', 'Loading data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'تسجيل فحص جودة', 'Create Inspection')} eyebrow="Quality">
        <form className="ui-form" onSubmit={handleCreateInspection}>
          <label>
            <span>{pickLocalized(locale, 'المشروع', 'Project')}</span>
            <select
              required
              value={inspectionForm.projectId}
              onChange={(event) => setInspectionForm((current) => ({ ...current, projectId: event.target.value }))}
            >
              <option value="">{pickLocalized(locale, 'اختر مشروعاً', 'Select project')}</option>
              {referenceData.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, 'مشروع', 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ الفحص', 'Inspection Date')}</span>
            <input
              type="date"
              required
              value={inspectionForm.logDate}
              onChange={(event) => setInspectionForm((current) => ({ ...current, logDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'ملخص التقدم', 'Progress Summary')}</span>
            <input
              value={inspectionForm.progressSummary}
              onChange={(event) => setInspectionForm((current) => ({ ...current, progressSummary: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'الملاحظات/المشكلات', 'Issues')}</span>
            <input value={inspectionForm.issues} onChange={(event) => setInspectionForm((current) => ({ ...current, issues: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'تفاصيل إضافية', 'Notes')}</span>
            <input value={inspectionForm.notes} onChange={(event) => setInspectionForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'inspection'}>
            {submitting === 'inspection'
              ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...')
              : pickLocalized(locale, 'تسجيل الفحص', 'Save Inspection')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تسجيل حادث سلامة', 'Create Incident')} eyebrow="Safety">
        <form className="ui-form" onSubmit={handleCreateIncident}>
          <label>
            <span>{pickLocalized(locale, 'الأصل/المعدة', 'Asset')}</span>
            <select required value={incidentForm.assetId} onChange={(event) => setIncidentForm((current) => ({ ...current, assetId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'اختر أصلاً', 'Select asset')}</option>
              {referenceData.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.code || `AST-${asset.id}`} - {asset.nameAr || pickLocalized(locale, 'أصل', 'Asset')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'المشروع', 'Project')}</span>
            <select value={incidentForm.projectId} onChange={(event) => setIncidentForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'بدون مشروع', 'No project')}</option>
              {referenceData.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, 'مشروع', 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'عنوان الحادث', 'Incident Title')}</span>
            <input required value={incidentForm.title} onChange={(event) => setIncidentForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ الحادث', 'Incident Date')}</span>
            <input type="date" value={incidentForm.issueDate} onChange={(event) => setIncidentForm((current) => ({ ...current, issueDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'درجة الخطورة', 'Severity')}</span>
            <select value={incidentForm.severity} onChange={(event) => setIncidentForm((current) => ({ ...current, severity: event.target.value }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الوصف', 'Description')}</span>
            <input
              value={incidentForm.description}
              onChange={(event) => setIncidentForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'incident'}>
            {submitting === 'incident'
              ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...')
              : pickLocalized(locale, 'تسجيل الحادث', 'Save Incident')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل الحوادث', 'Incident Register')} eyebrow="List">
        <div className="ui-list">
          {incidents.map((incident) => (
            <button key={incident.id} type="button" className="ui-list-item" onClick={() => setSelectedIncidentId(incident.id)}>
              <span>
                #{incident.id} - {incident.title}
              </span>
              <span>{incident.status || '-'}</span>
            </button>
          ))}
          {!incidents.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد حوادث مسجلة', 'No incidents')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تفاصيل الحادث', 'Incident Detail')} eyebrow="Resolve">
        {selectedIncident ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'العنوان', 'Title')}</strong>
              <span>{selectedIncident.title}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الخطورة', 'Severity')}</strong>
              <span>{selectedIncident.severity || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحالة', 'Status')}</strong>
              <span>{selectedIncident.status || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'تاريخ الحادث', 'Date')}</strong>
              <span>{shortDate(selectedIncident.issueDate)}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'المشروع', 'Project')}</strong>
              <span>{selectedIncident.project?.code || selectedIncident.projectId || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الأصل', 'Asset')}</strong>
              <span>{selectedIncident.asset?.code || selectedIncident.assetId}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الوصف', 'Description')}</strong>
              <span>{selectedIncident.description || '-'}</span>
            </div>
            <form className="ui-form" onSubmit={handleResolveIncident}>
              <label>
                <span>{pickLocalized(locale, 'ملاحظات الإغلاق', 'Resolution Notes')}</span>
                <input value={resolveNotes} onChange={(event) => setResolveNotes(event.target.value)} />
              </label>
              <button type="submit" className="ui-button" disabled={submitting === 'resolve' || selectedIncident.status === 'RESOLVED'}>
                {selectedIncident.status === 'RESOLVED'
                  ? pickLocalized(locale, 'تم الإغلاق', 'Already resolved')
                  : submitting === 'resolve'
                    ? pickLocalized(locale, 'جارٍ الإغلاق...', 'Resolving...')
                    : pickLocalized(locale, 'إغلاق الحادث', 'Resolve Incident')}
              </button>
            </form>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر حادثاً لعرض التفاصيل', 'Select incident to view details')}</div>
        )}
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'آخر فحوصات الجودة', 'Latest Inspections')} eyebrow="Quality">
        <div className="ui-list">
          {inspections.map((inspection) => (
            <div key={inspection.id} className="ui-list-item">
              <span>
                #{inspection.id} - {inspection.project?.code || inspection.projectId}
              </span>
              <span>{shortDate(inspection.logDate)}</span>
            </div>
          ))}
          {!inspections.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد فحوصات جودة', 'No inspections')}</div> : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
