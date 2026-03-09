import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type QueueCapabilities = {
  enabled: boolean;
  available: boolean;
  fallbackUsed?: boolean;
};

type TemplateRow = {
  id: number;
  key: string;
  entityType: string;
  nameAr: string;
  nameEn?: string | null;
  format?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  version?: number;
  updatedAt?: string;
};

type PrintJobRow = {
  id: number;
  entityType: string;
  recordId?: number | null;
  format?: string | null;
  status: string;
  attachmentId?: number | null;
  requestedAt?: string;
};

type RenderPreviewPayload = {
  html: string;
};

type DefaultsPayload = {
  entityTypes: string[];
  defaults: Array<{ key: string; entityType: string; nameAr: string }>;
  queue: QueueCapabilities;
};

type ListJobsPayload = {
  queue: QueueCapabilities;
  rows: PrintJobRow[];
};

type PreviewJobResponse = {
  queue: QueueCapabilities;
  job: PrintJobRow;
};

function shortDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [defaultsCount, setDefaultsCount] = useState(0);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [jobs, setJobs] = useState<PrintJobRow[]>([]);
  const [queue, setQueue] = useState<QueueCapabilities | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const [templateForm, setTemplateForm] = useState({
    key: 'custom-template',
    entityType: 'purchase_order',
    nameAr: 'قالب مخصص',
    nameEn: 'Custom Template',
    content: '<article><h1>{{document.number}}</h1><p>{{company.name}}</p></article>'
  });
  const [previewForm, setPreviewForm] = useState({
    entityType: 'purchase_order',
    content: '<article><h1>{{document.number}}</h1><p>{{supplier.name}}</p></article>',
    sampleDataJson: '{ "document": { "number": "PO-PREVIEW-001" }, "supplier": { "name": "Demo Supplier" } }'
  });
  const [jobForm, setJobForm] = useState({
    entityType: 'purchase_order',
    content: '<article><h2>{{document.number}}</h2><p>{{supplier.name}}</p></article>',
    format: 'pdf',
    sampleDataJson: '{ "document": { "number": "PO-JOB-001" }, "supplier": { "name": "Job Supplier" } }'
  });

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [defaultsRes, templatesRes, jobsRes] = await Promise.all([
        getJson<DefaultsPayload>('/printing/templates/defaults'),
        getJson<TemplateRow[]>('/printing/templates'),
        getJson<ListJobsPayload>('/printing/jobs?limit=30')
      ]);

      setEntityTypes(defaultsRes.data.entityTypes);
      setDefaultsCount(defaultsRes.data.defaults.length);
      setTemplates(templatesRes.data);
      setJobs(jobsRes.data.rows);
      setQueue(jobsRes.data.queue || defaultsRes.data.queue);
      setSelectedJobId((current) => current ?? jobsRes.data.rows[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل بيانات الطباعة', 'Failed to load printing data')
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

  async function handleBootstrapDefaults() {
    setSubmitting('bootstrap');
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<{ total: number }>('/printing/templates/bootstrap-defaults', {});
      setMessage(
        pickLocalized(
          locale,
          `تم تهيئة القوالب الافتراضية (${response.data.total})`,
          `Default templates bootstrapped (${response.data.total})`
        )
      );
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تهيئة القوالب الافتراضية', 'Failed to bootstrap defaults')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('template');
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<TemplateRow>('/printing/templates', {
        key: templateForm.key,
        entityType: templateForm.entityType,
        nameAr: templateForm.nameAr,
        nameEn: templateForm.nameEn || undefined,
        content: templateForm.content,
        isDefault: false
      });
      setMessage(
        pickLocalized(
          locale,
          `تم إنشاء القالب #${response.data.id}`,
          `Template #${response.data.id} created`
        )
      );
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء القالب', 'Failed to create template')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleRenderPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('preview');
    setError(null);
    setMessage(null);
    try {
      const sampleData = JSON.parse(previewForm.sampleDataJson);
      const response = await postJson<RenderPreviewPayload>('/printing/render/preview', {
        entityType: previewForm.entityType,
        content: previewForm.content,
        sampleData
      });
      setPreviewHtml(response.data.html);
      setMessage(pickLocalized(locale, 'تم توليد المعاينة', 'Preview generated'));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر توليد المعاينة', 'Failed to generate preview')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreatePreviewJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('job');
    setError(null);
    setMessage(null);
    try {
      const sampleData = JSON.parse(jobForm.sampleDataJson);
      const response = await postJson<PreviewJobResponse>('/printing/jobs/preview', {
        entityType: jobForm.entityType,
        content: jobForm.content,
        format: jobForm.format,
        sampleData
      });
      setMessage(
        pickLocalized(
          locale,
          `تم إنشاء مهمة طباعة #${response.data.job.id}`,
          `Print job #${response.data.job.id} created`
        )
      );
      await loadData();
      setSelectedJobId(response.data.job.id);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء مهمة الطباعة', 'Failed to create print job')
      );
    } finally {
      setSubmitting(null);
    }
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
      <SectionCard
        title={pickLocalized(locale, 'حالة خدمة الطباعة', 'Printing Service Status')}
        eyebrow="Queue"
        actions={
          <button type="button" className="ui-button" onClick={() => void handleBootstrapDefaults()} disabled={submitting === 'bootstrap'}>
            {submitting === 'bootstrap'
              ? pickLocalized(locale, 'جارٍ التهيئة...', 'Bootstrapping...')
              : pickLocalized(locale, 'تهيئة القوالب الافتراضية', 'Bootstrap Defaults')}
          </button>
        }
      >
        <div className="ui-list">
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'الطابور متاح', 'Queue Available')}</strong>
            <span>{queue?.available ? 'Yes' : 'No'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'الطابور مفعّل', 'Queue Enabled')}</strong>
            <span>{queue?.enabled ? 'Yes' : 'No'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'أنواع الكيانات', 'Entity Types')}</strong>
            <span>{entityTypes.length}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'القوالب الافتراضية', 'Default Templates')}</strong>
            <span>{defaultsCount}</span>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل بيانات الطباعة...', 'Loading printing data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'إنشاء قالب', 'Create Template')} eyebrow="Templates">
        <form className="ui-form" onSubmit={handleCreateTemplate}>
          <label>
            <span>{pickLocalized(locale, 'مفتاح القالب', 'Template Key')}</span>
            <input value={templateForm.key} onChange={(event) => setTemplateForm((current) => ({ ...current, key: event.target.value }))} required />
          </label>
          <label>
            <span>{pickLocalized(locale, 'نوع الكيان', 'Entity Type')}</span>
            <select value={templateForm.entityType} onChange={(event) => setTemplateForm((current) => ({ ...current, entityType: event.target.value }))}>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الاسم العربي', 'Arabic Name')}</span>
            <input value={templateForm.nameAr} onChange={(event) => setTemplateForm((current) => ({ ...current, nameAr: event.target.value }))} required />
          </label>
          <label>
            <span>{pickLocalized(locale, 'الاسم الإنجليزي', 'English Name')}</span>
            <input value={templateForm.nameEn} onChange={(event) => setTemplateForm((current) => ({ ...current, nameEn: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'محتوى القالب HTML', 'Template HTML')}</span>
            <textarea
              rows={5}
              value={templateForm.content}
              onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'template'}>
            {submitting === 'template' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء القالب', 'Create Template')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'معاينة فورية', 'Inline Preview')} eyebrow="Preview">
        <form className="ui-form" onSubmit={handleRenderPreview}>
          <label>
            <span>{pickLocalized(locale, 'نوع الكيان', 'Entity Type')}</span>
            <select value={previewForm.entityType} onChange={(event) => setPreviewForm((current) => ({ ...current, entityType: event.target.value }))}>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'قالب HTML', 'HTML Template')}</span>
            <textarea
              rows={4}
              value={previewForm.content}
              onChange={(event) => setPreviewForm((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Sample Data JSON', 'Sample Data JSON')}</span>
            <textarea
              rows={4}
              value={previewForm.sampleDataJson}
              onChange={(event) => setPreviewForm((current) => ({ ...current, sampleDataJson: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'preview'}>
            {submitting === 'preview'
              ? pickLocalized(locale, 'جارٍ التوليد...', 'Generating...')
              : pickLocalized(locale, 'توليد المعاينة', 'Generate Preview')}
          </button>
        </form>
        {previewHtml ? (
          <div className="ui-card">
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{previewHtml}</pre>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'إنشاء مهمة طباعة معاينة', 'Create Preview Print Job')} eyebrow="Jobs">
        <form className="ui-form" onSubmit={handleCreatePreviewJob}>
          <label>
            <span>{pickLocalized(locale, 'نوع الكيان', 'Entity Type')}</span>
            <select value={jobForm.entityType} onChange={(event) => setJobForm((current) => ({ ...current, entityType: event.target.value }))}>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'التنسيق', 'Format')}</span>
            <select value={jobForm.format} onChange={(event) => setJobForm((current) => ({ ...current, format: event.target.value }))}>
              <option value="pdf">pdf</option>
              <option value="xlsx">xlsx</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'قالب HTML', 'HTML Template')}</span>
            <textarea rows={4} value={jobForm.content} onChange={(event) => setJobForm((current) => ({ ...current, content: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Sample Data JSON', 'Sample Data JSON')}</span>
            <textarea
              rows={4}
              value={jobForm.sampleDataJson}
              onChange={(event) => setJobForm((current) => ({ ...current, sampleDataJson: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'job'}>
            {submitting === 'job' ? pickLocalized(locale, 'جارٍ الإنشاء...', 'Creating...') : pickLocalized(locale, 'إنشاء المهمة', 'Create Job')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل القوالب', 'Templates Register')} eyebrow="Templates">
        <div className="ui-list">
          {templates.map((template) => (
            <div key={template.id} className="ui-list-item">
              <span>
                #{template.id} {template.key} ({template.entityType})
              </span>
              <span>{template.nameAr}</span>
            </div>
          ))}
          {!templates.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد قوالب', 'No templates')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل مهام الطباعة', 'Print Jobs Register')} eyebrow="Jobs">
        <div className="ui-list">
          {jobs.map((job) => (
            <button key={job.id} type="button" className="ui-list-item" onClick={() => setSelectedJobId(job.id)}>
              <span>
                #{job.id} {job.entityType} ({job.format || '-'})
              </span>
              <span>{job.status}</span>
            </button>
          ))}
          {!jobs.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد مهام طباعة', 'No print jobs')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تفاصيل المهمة', 'Job Details')} eyebrow="Download">
        {selectedJob ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>ID</strong>
              <span>{selectedJob.id}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحالة', 'Status')}</strong>
              <span>{selectedJob.status}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الكيان', 'Entity')}</strong>
              <span>{selectedJob.entityType}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'التنسيق', 'Format')}</strong>
              <span>{selectedJob.format || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'وقت الطلب', 'Requested At')}</strong>
              <span>{shortDate(selectedJob.requestedAt)}</span>
            </div>
            <div className="ui-actions">
              {selectedJob.attachmentId ? (
                <a className="ui-button" href={`/api/v1/printing/jobs/${selectedJob.id}/download`}>
                  {pickLocalized(locale, 'تنزيل الملف', 'Download File')}
                </a>
              ) : (
                <span className="ui-muted">{pickLocalized(locale, 'الملف غير جاهز بعد', 'File not ready yet')}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر مهمة لعرض التفاصيل', 'Select a job to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
