import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type SubcontractorRow = {
  id: number;
  code?: string | null;
  nameAr: string;
  status?: string | null;
  rating?: number | string | null;
};

type ContractRow = {
  id: number;
  subcontractorId: number;
  number?: string | null;
  title: string;
  status?: string | null;
  amount?: number | string | null;
  startDate?: string | null;
};

type CertificateRow = {
  id: number;
  contractId: number;
  number?: string | null;
  status?: string | null;
  grossAmount?: number | string | null;
  netAmount?: number | string | null;
  certificateDate?: string | null;
};

type PaymentRow = {
  id: number;
  contractId: number;
  amount?: number | string | null;
  paymentDate?: string | null;
  status?: string | null;
};

type PerformanceReport = {
  summary?: {
    subcontractors?: number;
    contracts?: number;
    certificates?: number;
    payments?: number;
    certifiedAmount?: number;
    paidAmount?: number;
  };
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

  const [subcontractors, setSubcontractors] = useState<SubcontractorRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [report, setReport] = useState<PerformanceReport | null>(null);

  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedCertificateId, setSelectedCertificateId] = useState<number | null>(null);

  const [subcontractorForm, setSubcontractorForm] = useState({
    nameAr: '',
    specialty: ''
  });
  const [contractForm, setContractForm] = useState({
    title: '',
    startDate: new Date().toISOString().slice(0, 10),
    amount: ''
  });
  const [certificateForm, setCertificateForm] = useState({
    grossAmount: '',
    certificateDate: new Date().toISOString().slice(0, 10)
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10)
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [subsRes, contractsRes, certificatesRes, paymentsRes, reportRes] = await Promise.all([
        getJson<SubcontractorRow[] | RowsEnvelope<SubcontractorRow>>('/subcontractors?limit=50'),
        getJson<ContractRow[] | RowsEnvelope<ContractRow>>('/subcontractors/contracts?limit=50'),
        getJson<CertificateRow[] | RowsEnvelope<CertificateRow>>('/subcontractors/certificates?limit=50'),
        getJson<PaymentRow[] | RowsEnvelope<PaymentRow>>('/subcontractors/payments?limit=50'),
        getJson<PerformanceReport>('/subcontractors/reports/performance')
      ]);

      const normalizedSubs = normalizeRows(subsRes.data);
      const normalizedContracts = normalizeRows(contractsRes.data);
      const normalizedCertificates = normalizeRows(certificatesRes.data);
      const normalizedPayments = normalizeRows(paymentsRes.data);
      setSubcontractors(normalizedSubs);
      setContracts(normalizedContracts);
      setCertificates(normalizedCertificates);
      setPayments(normalizedPayments);
      setReport(reportRes.data);
      setSelectedSubcontractorId((current) => current ?? normalizedSubs[0]?.id ?? null);
      setSelectedContractId((current) => current ?? normalizedContracts[0]?.id ?? null);
      setSelectedCertificateId((current) => current ?? normalizedCertificates[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load subcontractors data');
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

  async function handleCreateSubcontractor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-subcontractor');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<SubcontractorRow>('/subcontractors', {
        nameAr: subcontractorForm.nameAr,
        specialty: subcontractorForm.specialty || undefined
      });
      setSubcontractorForm({ nameAr: '', specialty: '' });
      setSelectedSubcontractorId(created.data.id);
      setMessage('Subcontractor created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create subcontractor');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubcontractorId) return;
    setSubmitting('create-contract');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<ContractRow>(`/subcontractors/${selectedSubcontractorId}/contracts`, {
        title: contractForm.title,
        startDate: contractForm.startDate,
        amount: contractForm.amount ? Number(contractForm.amount) : undefined
      });
      setContractForm({
        title: '',
        startDate: new Date().toISOString().slice(0, 10),
        amount: ''
      });
      setSelectedContractId(created.data.id);
      setMessage('Subcontract contract created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create subcontract contract');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContractId) return;
    setSubmitting('create-certificate');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<CertificateRow>(`/subcontractors/contracts/${selectedContractId}/certificates`, {
        grossAmount: Number(certificateForm.grossAmount),
        certificateDate: certificateForm.certificateDate
      });
      setCertificateForm({
        grossAmount: '',
        certificateDate: new Date().toISOString().slice(0, 10)
      });
      setSelectedCertificateId(created.data.id);
      setMessage('Certificate created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create certificate');
    } finally {
      setSubmitting(null);
    }
  }

  async function approveCertificate(id: number) {
    setSubmitting(`approve-certificate-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<CertificateRow>(`/subcontractors/certificates/${id}/approve`, {});
      setMessage('Certificate approved');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to approve certificate');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContractId) return;
    setSubmitting('create-payment');
    setMessage(null);
    setError(null);
    try {
      await postJson<PaymentRow>('/subcontractors/payments', {
        contractId: selectedContractId,
        certificateId: selectedCertificateId ?? undefined,
        amount: Number(paymentForm.amount),
        paymentDate: paymentForm.paymentDate
      });
      setPaymentForm({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10)
      });
      setMessage('Payment recorded');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to record payment');
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
      <SectionCard title={pickLocalized(locale, 'Subcontractors Overview', 'Subcontractors Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Subcontractors', 'Subcontractors')}</span>
            <strong>{report?.summary?.subcontractors ?? subcontractors.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Contracts', 'Contracts')}</span>
            <strong>{report?.summary?.contracts ?? contracts.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Certificates', 'Certificates')}</span>
            <strong>{report?.summary?.certificates ?? certificates.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Paid Amount', 'Paid Amount')}</span>
            <strong>{money(report?.summary?.paidAmount ?? 0)} KWD</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading subcontractors data...', 'Loading subcontractors data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Subcontractor', 'Create Subcontractor')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateSubcontractor}>
          <label>
            <span>{pickLocalized(locale, 'Name', 'Name')}</span>
            <input required value={subcontractorForm.nameAr} onChange={(event) => setSubcontractorForm((current) => ({ ...current, nameAr: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Specialty', 'Specialty')}</span>
            <input value={subcontractorForm.specialty} onChange={(event) => setSubcontractorForm((current) => ({ ...current, specialty: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-subcontractor'}>
            {submitting === 'create-subcontractor' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Subcontractor', 'Create Subcontractor')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Create Contract / Certificate / Payment', 'Create Contract / Certificate / Payment')} eyebrow="Execution">
        <form className="ui-form" onSubmit={handleCreateContract}>
          <label>
            <span>{pickLocalized(locale, 'Subcontractor', 'Subcontractor')}</span>
            <select required value={selectedSubcontractorId ?? ''} onChange={(event) => setSelectedSubcontractorId(Number(event.target.value))}>
              <option value="">{pickLocalized(locale, 'Select subcontractor', 'Select subcontractor')}</option>
              {subcontractors.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `SUB-${row.id}`) + ' - ' + row.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Contract Title', 'Contract Title')}</span>
            <input required value={contractForm.title} onChange={(event) => setContractForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Start Date', 'Start Date')}</span>
            <input type="date" required value={contractForm.startDate} onChange={(event) => setContractForm((current) => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Amount', 'Amount')}</span>
            <input type="number" step="0.001" value={contractForm.amount} onChange={(event) => setContractForm((current) => ({ ...current, amount: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-contract' || !selectedSubcontractorId}>
            {submitting === 'create-contract' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Contract', 'Create Contract')}
          </button>
        </form>

        <form className="ui-form" onSubmit={handleCreateCertificate}>
          <label>
            <span>{pickLocalized(locale, 'Contract', 'Contract')}</span>
            <select required value={selectedContractId ?? ''} onChange={(event) => setSelectedContractId(Number(event.target.value))}>
              <option value="">{pickLocalized(locale, 'Select contract', 'Select contract')}</option>
              {contracts.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.number ?? `SC-${row.id}`) + ' - ' + row.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Certificate Date', 'Certificate Date')}</span>
            <input
              type="date"
              required
              value={certificateForm.certificateDate}
              onChange={(event) => setCertificateForm((current) => ({ ...current, certificateDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Gross Amount', 'Gross Amount')}</span>
            <input
              type="number"
              step="0.001"
              required
              value={certificateForm.grossAmount}
              onChange={(event) => setCertificateForm((current) => ({ ...current, grossAmount: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-certificate' || !selectedContractId}>
            {submitting === 'create-certificate' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Certificate', 'Create Certificate')}
          </button>
        </form>

        <form className="ui-form" onSubmit={handleCreatePayment}>
          <label>
            <span>{pickLocalized(locale, 'Linked Certificate', 'Linked Certificate')}</span>
            <select value={selectedCertificateId ?? ''} onChange={(event) => setSelectedCertificateId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">{pickLocalized(locale, 'No certificate', 'No certificate')}</option>
              {certificates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.number ?? `CERT-${row.id}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Payment Date', 'Payment Date')}</span>
            <input type="date" required value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Amount', 'Amount')}</span>
            <input type="number" step="0.001" required value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-payment' || !selectedContractId}>
            {submitting === 'create-payment' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Record Payment', 'Record Payment')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Contracts / Certificates / Payments', 'Contracts / Certificates / Payments')} eyebrow="Records">
        <div className="ui-grid">
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Contracts', 'Contracts')}</p>
            <div className="ui-list">
              {contracts.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{(row.number ?? `SC-${row.id}`) + ' - ' + row.title}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + money(row.amount) + ' KWD | ' + shortDate(row.startDate)}</p>
                  </div>
                </div>
              ))}
              {!contracts.length ? <p className="ui-muted">{pickLocalized(locale, 'No contracts yet', 'No contracts yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Certificates', 'Certificates')}</p>
            <div className="ui-list">
              {certificates.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.number ?? `CERT-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + money(row.grossAmount) + ' KWD | ' + shortDate(row.certificateDate)}</p>
                  </div>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => void approveCertificate(row.id)}
                    disabled={submitting === `approve-certificate-${row.id}` || (row.status ?? '').toUpperCase() === 'APPROVED'}
                  >
                    {submitting === `approve-certificate-${row.id}` ? pickLocalized(locale, 'Approving...', 'Approving...') : pickLocalized(locale, 'Approve', 'Approve')}
                  </button>
                </div>
              ))}
              {!certificates.length ? <p className="ui-muted">{pickLocalized(locale, 'No certificates yet', 'No certificates yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Payments', 'Payments')}</p>
            <div className="ui-list">
              {payments.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{`PAY-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'RECORDED') + ' | ' + money(row.amount) + ' KWD | ' + shortDate(row.paymentDate)}</p>
                  </div>
                </div>
              ))}
              {!payments.length ? <p className="ui-muted">{pickLocalized(locale, 'No payments yet', 'No payments yet')}</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
