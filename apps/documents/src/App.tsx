import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch, getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type StorageCaps = {
  driver: string;
  bucket?: string;
  localPath?: string;
};

type AttachmentRow = {
  id: number;
  entityType: string;
  entityId: number;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
  createdById?: number | null;
};

type DocumentsListPayload = {
  storage: StorageCaps;
  rows: AttachmentRow[];
};

type DocumentCreatePayload = {
  storage: StorageCaps;
  attachment: AttachmentRow;
};

type DocumentDetailPayload = {
  attachment: AttachmentRow;
};

type DeletePayload = {
  deleted: boolean;
  id?: number;
};

function prettyBytes(value?: number | null) {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function toBase64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [storage, setStorage] = useState<StorageCaps | null>(null);
  const [documents, setDocuments] = useState<AttachmentRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<AttachmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filterForm, setFilterForm] = useState({
    entityType: '',
    entityId: '',
    limit: '30'
  });

  const [createForm, setCreateForm] = useState({
    entityType: 'project',
    entityId: '',
    fileName: 'document-note.txt',
    mimeType: 'text/plain',
    contentText: ''
  });

  async function loadDocuments() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterForm.entityType.trim()) params.set('entityType', filterForm.entityType.trim());
      if (filterForm.entityId.trim()) params.set('entityId', filterForm.entityId.trim());
      if (filterForm.limit.trim()) params.set('limit', filterForm.limit.trim());

      const path = params.toString() ? `/documents?${params.toString()}` : '/documents';
      const response = await getJson<DocumentsListPayload>(path);

      setStorage(response.data.storage);
      setDocuments(response.data.rows);
      setSelectedId((current) => current ?? response.data.rows[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل المستندات', 'Failed to load documents')
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDocument(id: number) {
    try {
      const response = await getJson<DocumentDetailPayload>(`/documents/${id}`);
      setSelectedDoc(response.data.attachment);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : pickLocalized(locale, 'تعذر تحميل تفاصيل المستند', 'Failed to load document detail')
      );
    }
  }

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDoc(null);
      return;
    }
    void loadDocument(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  async function handleApplyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadDocuments();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create');
    setError(null);
    setMessage(null);

    try {
      const response = await postJson<DocumentCreatePayload>('/documents', {
        entityType: createForm.entityType.trim(),
        entityId: Number(createForm.entityId),
        fileName: createForm.fileName.trim(),
        mimeType: createForm.mimeType.trim() || undefined,
        contentBase64: toBase64(createForm.contentText || '')
      });

      setCreateForm((current) => ({
        ...current,
        contentText: ''
      }));
      setSelectedId(response.data.attachment.id);
      setMessage(pickLocalized(locale, 'تم إنشاء المستند بنجاح', 'Document created successfully'));
      await loadDocuments();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء المستند', 'Failed to create document')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDelete(id: number) {
    setSubmitting(`delete-${id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(`/documents/${id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { data: DeletePayload };
      if (payload.data.deleted) {
        if (selectedId === id) setSelectedId(null);
        setMessage(pickLocalized(locale, 'تم حذف المستند', 'Document deleted'));
        await loadDocuments();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : pickLocalized(locale, 'تعذر حذف المستند', 'Failed to delete document')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDownload(id: number, fileName: string) {
    setSubmitting(`download-${id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(`/documents/${id}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : pickLocalized(locale, 'تعذر تنزيل المستند', 'Failed to download document')
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
          <button type="button" className="ui-link" onClick={() => void loadDocuments()}>
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
      <SectionCard title={pickLocalized(locale, 'وضع التخزين', 'Storage Capability')} eyebrow="Storage">
        <div className="ui-list">
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'المشغل', 'Driver')}</strong>
            <span>{storage?.driver || '-'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'المسار/الحاوية', 'Path/Bucket')}</strong>
            <span>{storage?.bucket || storage?.localPath || '-'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'عدد المستندات', 'Documents Count')}</strong>
            <span>{documents.length}</span>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل المستندات...', 'Loading documents...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'تصفية السجل', 'Filter Register')} eyebrow="Filter">
        <form className="ui-form" onSubmit={handleApplyFilter}>
          <label>
            <span>{pickLocalized(locale, 'نوع الكيان', 'Entity Type')}</span>
            <input
              value={filterForm.entityType}
              onChange={(event) => setFilterForm((current) => ({ ...current, entityType: event.target.value }))}
              placeholder="project"
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'معرف الكيان', 'Entity ID')}</span>
            <input
              type="number"
              min="1"
              value={filterForm.entityId}
              onChange={(event) => setFilterForm((current) => ({ ...current, entityId: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'الحد', 'Limit')}</span>
            <input
              type="number"
              min="1"
              max="200"
              value={filterForm.limit}
              onChange={(event) => setFilterForm((current) => ({ ...current, limit: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button">
            {pickLocalized(locale, 'تطبيق التصفية', 'Apply Filter')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'إنشاء مستند نصي سريع', 'Create Quick Text Document')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreate}>
          <label>
            <span>{pickLocalized(locale, 'نوع الكيان', 'Entity Type')}</span>
            <input
              required
              value={createForm.entityType}
              onChange={(event) => setCreateForm((current) => ({ ...current, entityType: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'معرف الكيان', 'Entity ID')}</span>
            <input
              required
              type="number"
              min="1"
              value={createForm.entityId}
              onChange={(event) => setCreateForm((current) => ({ ...current, entityId: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'اسم الملف', 'File Name')}</span>
            <input
              required
              value={createForm.fileName}
              onChange={(event) => setCreateForm((current) => ({ ...current, fileName: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'نوع الملف', 'MIME Type')}</span>
            <input
              value={createForm.mimeType}
              onChange={(event) => setCreateForm((current) => ({ ...current, mimeType: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'محتوى نصي', 'Text Content')}</span>
            <textarea
              rows={5}
              value={createForm.contentText}
              onChange={(event) => setCreateForm((current) => ({ ...current, contentText: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create'}>
            {submitting === 'create' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء المستند', 'Create Document')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل المستندات', 'Documents Register')} eyebrow="List">
        <div className="ui-list">
          {documents.map((row) => (
            <div key={row.id} className="ui-list-item">
              <button type="button" className="ui-link" onClick={() => setSelectedId(row.id)}>
                #{row.id} - {row.fileName}
              </button>
              <span>{row.entityType}:{row.entityId}</span>
            </div>
          ))}
          {!documents.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد مستندات', 'No documents found')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تفاصيل المستند', 'Document Details')} eyebrow="Detail">
        {selectedDoc ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'اسم الملف', 'File Name')}</strong>
              <span>{selectedDoc.fileName}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الكيان', 'Entity')}</strong>
              <span>{selectedDoc.entityType}:{selectedDoc.entityId}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'النوع', 'MIME Type')}</strong>
              <span>{selectedDoc.mimeType || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحجم', 'Size')}</strong>
              <span>{prettyBytes(selectedDoc.sizeBytes)}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'تاريخ الإنشاء', 'Created At')}</strong>
              <span>{shortDate(selectedDoc.createdAt)}</span>
            </div>
            <div className="ui-actions">
              <button
                type="button"
                className="ui-button"
                onClick={() => void handleDownload(selectedDoc.id, selectedDoc.fileName)}
                disabled={submitting === `download-${selectedDoc.id}`}
              >
                {submitting === `download-${selectedDoc.id}`
                  ? pickLocalized(locale, 'جارٍ التنزيل...', 'Downloading...')
                  : pickLocalized(locale, 'تنزيل', 'Download')}
              </button>
              <button
                type="button"
                className="ui-link"
                onClick={() => void handleDelete(selectedDoc.id)}
                disabled={submitting === `delete-${selectedDoc.id}`}
              >
                {submitting === `delete-${selectedDoc.id}`
                  ? pickLocalized(locale, 'جارٍ الحذف...', 'Deleting...')
                  : pickLocalized(locale, 'حذف', 'Delete')}
              </button>
            </div>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر مستنداً لعرض التفاصيل', 'Select a document to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
