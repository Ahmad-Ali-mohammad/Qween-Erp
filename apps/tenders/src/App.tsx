import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type TenderRow = {
  id: number;
  title: string;
  customerId?: number | null;
  expectedCloseDate?: string | null;
  value?: number | string | null;
  probability?: number | null;
  notes?: string | null;
  stage?: string | null;
  status?: string | null;
  createdAt?: string;
};

type CustomerRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type RowsEnvelope<T> = {
  rows: T[];
};

type WinRateReport = {
  total: number;
  won: number;
  lost: number;
  winRate: number;
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
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return [];
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [report, setReport] = useState<WinRateReport | null>(null);
  const [selectedTenderId, setSelectedTenderId] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState({
    title: '',
    customerId: '',
    expectedCloseDate: '',
    value: '',
    probability: '50',
    notes: ''
  });
  const [resultForm, setResultForm] = useState({
    result: 'WON',
    reason: '',
    convertToContract: true
  });

  const selectedTender = tenders.find((row) => row.id === selectedTenderId) ?? null;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [tendersRes, customersRes, reportRes] = await Promise.all([
        getJson<TenderRow[] | RowsEnvelope<TenderRow>>('/tenders?limit=50'),
        getJson<CustomerRow[] | RowsEnvelope<CustomerRow>>('/crm/customers?limit=100'),
        getJson<WinRateReport>('/tenders/reports/win-rate')
      ]);

      const normalizedTenders = normalizeRows(tendersRes.data);
      setTenders(normalizedTenders);
      setCustomers(normalizeRows(customersRes.data));
      setReport(reportRes.data);
      setSelectedTenderId((current) => current ?? normalizedTenders[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : pickLocalized(locale, 'تعذر تحميل العطاءات', 'Failed to load tenders'));
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

  async function handleCreateTender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create');
    setError(null);
    setMessage(null);

    try {
      const response = await postJson<TenderRow>('/tenders', {
        title: createForm.title,
        customerId: createForm.customerId ? Number(createForm.customerId) : undefined,
        expectedCloseDate: createForm.expectedCloseDate || undefined,
        value: createForm.value ? Number(createForm.value) : undefined,
        probability: Number(createForm.probability),
        notes: createForm.notes || undefined
      });

      setCreateForm({
        title: '',
        customerId: '',
        expectedCloseDate: '',
        value: '',
        probability: '50',
        notes: ''
      });
      setSelectedTenderId(response.data.id);
      setMessage(pickLocalized(locale, 'تم إنشاء العطاء بنجاح', 'Tender created successfully'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إنشاء العطاء', 'Failed to create tender'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSubmitTender(id: number) {
    setSubmitting(`submit-${id}`);
    setError(null);
    setMessage(null);
    try {
      await postJson<TenderRow>(`/tenders/${id}/submit`, {});
      setMessage(pickLocalized(locale, 'تم إرسال العطاء', 'Tender submitted'));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إرسال العطاء', 'Failed to submit tender'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSetResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTenderId) return;

    setSubmitting('result');
    setError(null);
    setMessage(null);
    try {
      const response = await postJson<{
        tenderId: number;
        result: 'WON' | 'LOST';
        reason?: string | null;
        contract?: {
          duplicate?: boolean;
          contractId?: number;
        } | null;
      }>(`/tenders/${selectedTenderId}/result`, {
        result: resultForm.result,
        reason: resultForm.reason || undefined,
        convertToContract: resultForm.result === 'WON' ? resultForm.convertToContract : false
      });

      if (response.data.result === 'WON' && response.data.contract) {
        setMessage(
          pickLocalized(
            locale,
            `تم تسجيل العطاء كفائز وإنشاء عقد${response.data.contract.contractId ? ` #${response.data.contract.contractId}` : ''}`,
            `Tender marked WON and contract created${response.data.contract.contractId ? ` #${response.data.contract.contractId}` : ''}`
          )
        );
      } else {
        setMessage(pickLocalized(locale, 'تم تسجيل نتيجة العطاء', 'Tender result updated'));
      }

      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تحديث نتيجة العطاء', 'Failed to set tender result')
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) {
    return null;
  }

  const openCount = tenders.filter((row) => row.status !== 'WON' && row.status !== 'LOST').length;

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
      <SectionCard title={pickLocalized(locale, 'لوحة العطاءات', 'Tender Dashboard')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'إجمالي العطاءات', 'Total Tenders')}</span>
            <strong>{report?.total ?? tenders.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'عطاءات مفتوحة', 'Open Tenders')}</span>
            <strong>{openCount}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'العطاءات الفائزة', 'Won')}</span>
            <strong>{report?.won ?? 0}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'نسبة الفوز', 'Win Rate')}</span>
            <strong>{(report?.winRate ?? 0).toFixed(2)}%</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل البيانات...', 'Loading data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'إنشاء عطاء', 'Create Tender')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateTender}>
          <label>
            <span>{pickLocalized(locale, 'عنوان العطاء', 'Title')}</span>
            <input required value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'العميل', 'Customer')}</span>
            <select value={createForm.customerId} onChange={(event) => setCreateForm((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'بدون عميل', 'No customer')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code || `CUST-${customer.id}`} - {customer.nameAr || pickLocalized(locale, 'عميل', 'Customer')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ الإغلاق المتوقع', 'Expected Close Date')}</span>
            <input
              type="date"
              value={createForm.expectedCloseDate}
              onChange={(event) => setCreateForm((current) => ({ ...current, expectedCloseDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'القيمة', 'Value')}</span>
            <input type="number" step="0.001" value={createForm.value} onChange={(event) => setCreateForm((current) => ({ ...current, value: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'نسبة الاحتمال %', 'Probability %')}</span>
            <input
              type="number"
              min="0"
              max="100"
              value={createForm.probability}
              onChange={(event) => setCreateForm((current) => ({ ...current, probability: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
            <input value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create'}>
            {submitting === 'create' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء العطاء', 'Create Tender')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'سجل العطاءات', 'Tender Register')} eyebrow="List">
        <div className="ui-list">
          {tenders.map((tender) => (
            <div key={tender.id} className="ui-list-item">
              <button type="button" className="ui-link" onClick={() => setSelectedTenderId(tender.id)}>
                #{tender.id} - {tender.title}
              </button>
              <span>{tender.status || '-'}</span>
            </div>
          ))}
          {!tenders.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد عطاءات', 'No tenders')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard
        title={pickLocalized(locale, 'تفاصيل العطاء والإجراءات', 'Tender Detail & Actions')}
        eyebrow="Workflow"
        actions={
          selectedTender ? (
            <button
              type="button"
              className="ui-button"
              disabled={submitting === `submit-${selectedTender.id}` || selectedTender.stage === 'BID_SUBMITTED'}
              onClick={() => void handleSubmitTender(selectedTender.id)}
            >
              {selectedTender.stage === 'BID_SUBMITTED'
                ? pickLocalized(locale, 'تم الإرسال', 'Already submitted')
                : submitting === `submit-${selectedTender.id}`
                  ? pickLocalized(locale, 'جارٍ الإرسال...', 'Submitting...')
                  : pickLocalized(locale, 'إرسال العطاء', 'Submit Tender')}
            </button>
          ) : undefined
        }
      >
        {selectedTender ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'العنوان', 'Title')}</strong>
              <span>{selectedTender.title}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'المرحلة', 'Stage')}</strong>
              <span>{selectedTender.stage || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحالة', 'Status')}</strong>
              <span>{selectedTender.status || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'القيمة', 'Value')}</strong>
              <span>{money(selectedTender.value)} KWD</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الإغلاق المتوقع', 'Expected Close')}</strong>
              <span>{shortDate(selectedTender.expectedCloseDate)}</span>
            </div>
            <form className="ui-form" onSubmit={handleSetResult}>
              <label>
                <span>{pickLocalized(locale, 'النتيجة', 'Result')}</span>
                <select value={resultForm.result} onChange={(event) => setResultForm((current) => ({ ...current, result: event.target.value }))}>
                  <option value="WON">WON</option>
                  <option value="LOST">LOST</option>
                </select>
              </label>
              <label>
                <span>{pickLocalized(locale, 'السبب', 'Reason')}</span>
                <input value={resultForm.reason} onChange={(event) => setResultForm((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              {resultForm.result === 'WON' ? (
                <label>
                  <span>{pickLocalized(locale, 'تحويل تلقائي إلى عقد', 'Auto convert to contract')}</span>
                  <select
                    value={resultForm.convertToContract ? 'yes' : 'no'}
                    onChange={(event) => setResultForm((current) => ({ ...current, convertToContract: event.target.value === 'yes' }))}
                  >
                    <option value="yes">{pickLocalized(locale, 'نعم', 'Yes')}</option>
                    <option value="no">{pickLocalized(locale, 'لا', 'No')}</option>
                  </select>
                </label>
              ) : null}
              <button type="submit" className="ui-button" disabled={submitting === 'result'}>
                {submitting === 'result'
                  ? pickLocalized(locale, 'جارٍ التحديث...', 'Updating...')
                  : pickLocalized(locale, 'حفظ النتيجة', 'Save Result')}
              </button>
            </form>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر عطاءً لعرض التفاصيل', 'Select a tender to view details')}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
