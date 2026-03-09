import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch, getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type RiskRow = {
  id: number;
  userId?: number | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type UserRow = {
  id: number;
  username: string;
  fullName?: string | null;
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

  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [highRisks, setHighRisks] = useState<RiskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedRiskId, setSelectedRiskId] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState({
    title: '',
    ownerId: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    description: ''
  });
  const [updateForm, setUpdateForm] = useState({
    priority: 'MEDIUM',
    status: 'OPEN',
    dueDate: '',
    description: ''
  });
  const [mitigationForm, setMitigationForm] = useState({
    notes: '',
    status: 'IN_PROGRESS'
  });

  const selectedRisk = risks.find((row) => row.id === selectedRiskId) ?? null;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [risksRes, highRes, usersRes] = await Promise.all([
        getJson<RiskRow[]>('/risks?limit=50'),
        getJson<RiskRow[]>('/risks/reports/high'),
        getJson<UserRow[]>('/users?limit=100')
      ]);

      setRisks(risksRes.data);
      setHighRisks(highRes.data);
      setUsers(usersRes.data);

      const chosenId = selectedRiskId ?? risksRes.data[0]?.id ?? null;
      setSelectedRiskId(chosenId);
      const chosenRisk = risksRes.data.find((row) => row.id === chosenId);
      if (chosenRisk) {
        setUpdateForm({
          priority: chosenRisk.priority || 'MEDIUM',
          status: chosenRisk.status || 'OPEN',
          dueDate: chosenRisk.dueDate ? new Date(chosenRisk.dueDate).toISOString().slice(0, 10) : '',
          description: chosenRisk.description || ''
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل سجل المخاطر', 'Failed to load risk register'));
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

  async function handleCreateRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create');
    setError(null);
    setMessage(null);

    try {
      const response = await postJson<RiskRow>('/risks', {
        title: createForm.title,
        ownerId: createForm.ownerId ? Number(createForm.ownerId) : undefined,
        dueDate: createForm.dueDate || undefined,
        priority: createForm.priority,
        status: createForm.status,
        description: createForm.description || undefined
      });

      setCreateForm({
        title: '',
        ownerId: '',
        dueDate: '',
        priority: 'MEDIUM',
        status: 'OPEN',
        description: ''
      });
      setSelectedRiskId(response.data.id);
      setMessage(pickLocalized(locale, 'تم إنشاء الخطر بنجاح', 'Risk created successfully'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إنشاء الخطر', 'Failed to create risk'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleUpdateRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRiskId) return;

    setSubmitting('update');
    setError(null);
    setMessage(null);

    try {
      await apiFetch(`/risks/${selectedRiskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          priority: updateForm.priority,
          status: updateForm.status,
          dueDate: updateForm.dueDate || null,
          description: updateForm.description || undefined
        })
      });

      setMessage(pickLocalized(locale, 'تم تحديث بيانات الخطر', 'Risk updated successfully'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر تحديث الخطر', 'Failed to update risk'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleMitigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRiskId) return;

    setSubmitting('mitigation');
    setError(null);
    setMessage(null);

    try {
      await postJson<RiskRow>(`/risks/${selectedRiskId}/mitigation`, {
        notes: mitigationForm.notes,
        status: mitigationForm.status
      });
      setMitigationForm({
        notes: '',
        status: 'IN_PROGRESS'
      });
      setMessage(pickLocalized(locale, 'تم تسجيل إجراء التخفيف', 'Mitigation action added'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر تسجيل الإجراء', 'Failed to add mitigation'));
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) {
    return null;
  }

  const openCount = risks.filter((row) => row.status !== 'CLOSED' && row.status !== 'MITIGATED').length;

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
      <SectionCard title={pickLocalized(locale, 'لوحة المخاطر', 'Risk Dashboard')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'إجمالي المخاطر', 'Total Risks')}</span>
            <strong>{risks.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'مخاطر مفتوحة', 'Open Risks')}</span>
            <strong>{openCount}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'مخاطر عالية', 'High Risks')}</span>
            <strong>{highRisks.length}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل البيانات...', 'Loading data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'إنشاء خطر جديد', 'Create Risk')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateRisk}>
          <label>
            <span>{pickLocalized(locale, 'عنوان الخطر', 'Risk Title')}</span>
            <input required value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'المالك', 'Owner')}</span>
            <select value={createForm.ownerId} onChange={(event) => setCreateForm((current) => ({ ...current, ownerId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'بدون مالك', 'No owner')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName || user.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الخطورة', 'Priority')}</span>
            <select value={createForm.priority} onChange={(event) => setCreateForm((current) => ({ ...current, priority: event.target.value }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
            <select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="MITIGATED">MITIGATED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ الاستحقاق', 'Due Date')}</span>
            <input type="date" value={createForm.dueDate} onChange={(event) => setCreateForm((current) => ({ ...current, dueDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'الوصف', 'Description')}</span>
            <input value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create'}>
            {submitting === 'create' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء الخطر', 'Create Risk')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل المخاطر', 'Risk Register')} eyebrow="List">
        <div className="ui-list">
          {risks.map((risk) => (
            <button key={risk.id} type="button" className="ui-list-item" onClick={() => setSelectedRiskId(risk.id)}>
              <span>{risk.title.replace(/^\[RISK\]\s*/i, '')}</span>
              <span>{risk.priority || '-'}</span>
            </button>
          ))}
          {!risks.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد مخاطر مسجلة', 'No risks found')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تفاصيل الخطر', 'Risk Detail')} eyebrow="Manage">
        {selectedRisk ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'العنوان', 'Title')}</strong>
              <span>{selectedRisk.title.replace(/^\[RISK\]\s*/i, '')}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحالة', 'Status')}</strong>
              <span>{selectedRisk.status || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الخطورة', 'Priority')}</strong>
              <span>{selectedRisk.priority || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'تاريخ الاستحقاق', 'Due Date')}</strong>
              <span>{shortDate(selectedRisk.dueDate)}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الوصف', 'Description')}</strong>
              <span>{selectedRisk.description || '-'}</span>
            </div>

            <form className="ui-form" onSubmit={handleUpdateRisk}>
              <label>
                <span>{pickLocalized(locale, 'الخطورة', 'Priority')}</span>
                <select value={updateForm.priority} onChange={(event) => setUpdateForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
                <select value={updateForm.status} onChange={(event) => setUpdateForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="MITIGATED">MITIGATED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'تاريخ الاستحقاق', 'Due Date')}</span>
                <input type="date" value={updateForm.dueDate} onChange={(event) => setUpdateForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>
                <span>{pickLocalized(locale, 'الوصف', 'Description')}</span>
                <input value={updateForm.description} onChange={(event) => setUpdateForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <button type="submit" className="ui-button" disabled={submitting === 'update'}>
                {submitting === 'update' ? pickLocalized(locale, 'جارٍ التحديث...', 'Updating...') : pickLocalized(locale, 'تحديث الخطر', 'Update Risk')}
              </button>
            </form>

            <form className="ui-form" onSubmit={handleMitigation}>
              <label>
                <span>{pickLocalized(locale, 'إجراء التخفيف', 'Mitigation Notes')}</span>
                <input
                  required
                  value={mitigationForm.notes}
                  onChange={(event) => setMitigationForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'تحديث الحالة', 'Set Status')}</span>
                <select value={mitigationForm.status} onChange={(event) => setMitigationForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="MITIGATED">MITIGATED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </label>
              <button type="submit" className="ui-button" disabled={submitting === 'mitigation'}>
                {submitting === 'mitigation'
                  ? pickLocalized(locale, 'جارٍ التسجيل...', 'Saving...')
                  : pickLocalized(locale, 'إضافة إجراء تخفيف', 'Add Mitigation')}
              </button>
            </form>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر خطراً لعرض التفاصيل', 'Select a risk to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
