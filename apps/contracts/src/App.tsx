import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type CustomerRow = {
  id: number;
  code?: string | null;
  nameAr: string;
};

type OpportunityRow = {
  id: number;
  title: string;
  value?: number | string | null;
  stage?: string | null;
  status?: string | null;
};

type ProjectRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
  status?: string | null;
};

type ContractRow = {
  id: number;
  number?: string | null;
  title: string;
  partyType: string;
  partyId?: number | null;
  type?: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  value?: number | string | null;
  terms?: string | null;
  projects?: ProjectRow[];
};

type MilestoneRow = {
  id: number;
  title: string;
  dueDate?: string | null;
  amount?: number | string | null;
  status?: string | null;
  notes?: string | null;
};

type ContractState = {
  contracts: ContractRow[];
  customers: CustomerRow[];
  opportunities: OpportunityRow[];
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

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function shortDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [data, setData] = useState<ContractState | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    title: '',
    customerId: '',
    type: 'CONSTRUCTION',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    value: '',
    status: 'DRAFT',
    terms: ''
  });
  const [convertOpportunityForm, setConvertOpportunityForm] = useState({
    opportunityId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    status: 'APPROVED',
    type: 'CONSTRUCTION',
    value: ''
  });
  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    dueDate: '',
    amount: '',
    status: 'PLANNED',
    notes: ''
  });
  const [convertProjectForm, setConvertProjectForm] = useState({
    nameAr: '',
    nameEn: '',
    status: 'PLANNED',
    budget: '',
    description: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [contracts, customers, opportunities] = await Promise.all([
        getJson<ContractRow[] | RowsEnvelope<ContractRow>>('/contracts?limit=50'),
        getJson<CustomerRow[] | RowsEnvelope<CustomerRow>>('/customers'),
        getJson<OpportunityRow[] | RowsEnvelope<OpportunityRow>>('/crm/opportunities?limit=50')
      ]);

      const normalizedContracts = normalizeRows(contracts.data);
      setData({
        contracts: normalizedContracts,
        customers: normalizeRows(customers.data),
        opportunities: normalizeRows(opportunities.data)
      });

      if (!selectedContractId && normalizedContracts[0]) {
        setSelectedContractId(normalizedContracts[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل العقود', 'Failed to load contracts')
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadContractDetail(id: number) {
    try {
      const [contract, contractMilestones] = await Promise.all([
        getJson<ContractRow>(`/contracts/${id}`),
        getJson<MilestoneRow[] | RowsEnvelope<MilestoneRow>>(`/contracts/${id}/milestones`)
      ]);

      setSelectedContract(contract.data);
      setMilestones(normalizeRows(contractMilestones.data));
      setConvertProjectForm((current) => ({
        ...current,
        nameAr: contract.data.title,
        budget: contract.data.value ? String(contract.data.value) : ''
      }));
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : pickLocalized(locale, 'تعذر تحميل تفاصيل العقد', 'Failed to load contract details')
      );
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedContractId) {
      setSelectedContract(null);
      setMilestones([]);
      return;
    }

    void loadContractDetail(selectedContractId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractId]);

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

  async function handleCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<ContractRow>('/contracts', {
        title: createForm.title,
        partyType: 'CUSTOMER',
        partyId: Number(createForm.customerId),
        type: createForm.type,
        startDate: `${createForm.startDate}T00:00:00.000Z`,
        endDate: createForm.endDate ? `${createForm.endDate}T00:00:00.000Z` : undefined,
        value: createForm.value ? Number(createForm.value) : undefined,
        status: createForm.status,
        terms: createForm.terms || undefined
      });

      setSelectedContractId(response.data.id);
      setCreateForm({
        title: '',
        customerId: '',
        type: 'CONSTRUCTION',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: '',
        value: '',
        status: 'DRAFT',
        terms: ''
      });
      setMessage(pickLocalized(locale, 'تم إنشاء العقد بنجاح', 'Contract created successfully'));
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إنشاء العقد', 'Failed to create contract')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleConvertOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!convertOpportunityForm.opportunityId) return;

    setSubmitting('opportunity');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<{ duplicate: boolean; contractId: number; contractNumber?: string | null }>(
        `/contracts/opportunities/${convertOpportunityForm.opportunityId}/convert-to-contract`,
        {
          startDate: `${convertOpportunityForm.startDate}T00:00:00.000Z`,
          endDate: convertOpportunityForm.endDate ? `${convertOpportunityForm.endDate}T00:00:00.000Z` : undefined,
          status: convertOpportunityForm.status,
          type: convertOpportunityForm.type,
          value: convertOpportunityForm.value ? Number(convertOpportunityForm.value) : undefined
        }
      );

      setSelectedContractId(response.data.contractId);
      setConvertOpportunityForm({
        opportunityId: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: '',
        status: 'APPROVED',
        type: 'CONSTRUCTION',
        value: ''
      });
      setMessage(
        response.data.duplicate
          ? pickLocalized(locale, 'تم العثور على عقد موجود لهذه الفرصة', 'An existing contract was found for this opportunity')
          : pickLocalized(locale, 'تم تحويل الفرصة إلى عقد', 'Opportunity converted to contract')
      );
      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تحويل الفرصة', 'Failed to convert opportunity')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleApproveContract() {
    if (!selectedContractId) return;

    setSubmitting('approve');
    setMessage(null);
    setError(null);

    try {
      await postJson<ContractRow>(`/contracts/${selectedContractId}/approve`, {});
      setMessage(pickLocalized(locale, 'تم اعتماد العقد', 'Contract approved successfully'));
      await loadData();
      await loadContractDetail(selectedContractId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر اعتماد العقد', 'Failed to approve contract')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContractId) return;

    setSubmitting('milestone');
    setMessage(null);
    setError(null);

    try {
      await postJson<MilestoneRow>(`/contracts/${selectedContractId}/milestones`, {
        title: milestoneForm.title,
        dueDate: milestoneForm.dueDate ? `${milestoneForm.dueDate}T00:00:00.000Z` : undefined,
        amount: milestoneForm.amount ? Number(milestoneForm.amount) : undefined,
        status: milestoneForm.status,
        notes: milestoneForm.notes || undefined
      });

      setMilestoneForm({
        title: '',
        dueDate: '',
        amount: '',
        status: 'PLANNED',
        notes: ''
      });
      setMessage(pickLocalized(locale, 'تمت إضافة المرحلة التعاقدية', 'Contract milestone added successfully'));
      await loadContractDetail(selectedContractId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر إضافة المرحلة', 'Failed to add milestone')
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleConvertToProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContractId) return;

    setSubmitting('project');
    setMessage(null);
    setError(null);

    try {
      const response = await postJson<{ duplicate: boolean; projectId: number; projectCode?: string | null }>(
        `/contracts/${selectedContractId}/convert-to-project`,
        {
          nameAr: convertProjectForm.nameAr || undefined,
          nameEn: convertProjectForm.nameEn || undefined,
          status: convertProjectForm.status,
          budget: convertProjectForm.budget ? Number(convertProjectForm.budget) : undefined,
          description: convertProjectForm.description || undefined
        }
      );

      setMessage(
        response.data.duplicate
          ? pickLocalized(locale, 'تم العثور على مشروع مرتبط مسبقاً', 'An existing linked project was found')
          : pickLocalized(locale, 'تم تحويل العقد إلى مشروع', 'Contract converted to project')
      );
      await loadData();
      await loadContractDetail(selectedContractId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تحويل العقد إلى مشروع', 'Failed to convert contract to project')
      );
    } finally {
      setSubmitting(null);
    }
  }

  const activeContracts = data?.contracts.filter((row) => ['APPROVED', 'ACTIVE', 'RENEWED'].includes(row.status)).length ?? 0;
  const totalValue = data?.contracts.reduce((sum, row) => sum + Number(row.value ?? 0), 0) ?? 0;

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
          <span>{pickLocalized(locale, 'عدد العقود', 'Contracts')}</span>
          <strong>{data?.contracts.length ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'عقود نشطة', 'Active Contracts')}</span>
          <strong>{activeContracts}</strong>
        </article>
        <article className="metric-card">
          <span>{pickLocalized(locale, 'إجمالي القيمة', 'Total Value')}</span>
          <strong>{money(totalValue)} KWD</strong>
        </article>
      </section>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="empty-state">{pickLocalized(locale, 'جارٍ تحميل العقود...', 'Loading contracts...')}</div> : null}

      <section className="surface split-surface">
        <form className="form-card" onSubmit={handleCreateContract}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Contracts</p>
              <h2>{pickLocalized(locale, 'إنشاء عقد', 'Create Contract')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'عنوان العقد', 'Contract Title')}</span>
              <input required value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'العميل', 'Customer')}</span>
              <select required value={createForm.customerId} onChange={(event) => setCreateForm((current) => ({ ...current, customerId: event.target.value }))}>
                <option value="">{pickLocalized(locale, 'اختر عميلاً', 'Select customer')}</option>
                {data?.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.code || `CUST-${customer.id}`} - {customer.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'النوع', 'Type')}</span>
              <select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="CONSTRUCTION">CONSTRUCTION</option>
                <option value="SERVICE">SERVICE</option>
                <option value="SUPPLY">SUPPLY</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
              <select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="DRAFT">DRAFT</option>
                <option value="APPROVED">APPROVED</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ البداية', 'Start Date')}</span>
              <input type="date" required value={createForm.startDate} onChange={(event) => setCreateForm((current) => ({ ...current, startDate: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ النهاية', 'End Date')}</span>
              <input type="date" value={createForm.endDate} onChange={(event) => setCreateForm((current) => ({ ...current, endDate: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'القيمة', 'Value')}</span>
              <input type="number" step="0.001" value={createForm.value} onChange={(event) => setCreateForm((current) => ({ ...current, value: event.target.value }))} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span>{pickLocalized(locale, 'الشروط', 'Terms')}</span>
              <input value={createForm.terms} onChange={(event) => setCreateForm((current) => ({ ...current, terms: event.target.value }))} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'create'}>
            {submitting === 'create' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء العقد', 'Create Contract')}
          </button>
        </form>

        <form className="form-card" onSubmit={handleConvertOpportunity}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Opportunity Conversion</p>
              <h2>{pickLocalized(locale, 'تحويل فرصة إلى عقد', 'Convert Opportunity')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'الفرصة', 'Opportunity')}</span>
              <select
                required
                value={convertOpportunityForm.opportunityId}
                onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, opportunityId: event.target.value }))}
              >
                <option value="">{pickLocalized(locale, 'اختر فرصة', 'Select opportunity')}</option>
                {data?.opportunities.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'النوع', 'Type')}</span>
              <select value={convertOpportunityForm.type} onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="CONSTRUCTION">CONSTRUCTION</option>
                <option value="SERVICE">SERVICE</option>
                <option value="SUPPLY">SUPPLY</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
              <select value={convertOpportunityForm.status} onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="APPROVED">APPROVED</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ البداية', 'Start Date')}</span>
              <input
                type="date"
                required
                value={convertOpportunityForm.startDate}
                onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ النهاية', 'End Date')}</span>
              <input type="date" value={convertOpportunityForm.endDate} onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, endDate: event.target.value }))} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'القيمة', 'Value')}</span>
              <input type="number" step="0.001" value={convertOpportunityForm.value} onChange={(event) => setConvertOpportunityForm((current) => ({ ...current, value: event.target.value }))} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'opportunity'}>
            {submitting === 'opportunity'
              ? pickLocalized(locale, 'جارٍ التحويل...', 'Converting...')
              : pickLocalized(locale, 'تحويل الفرصة', 'Convert Opportunity')}
          </button>
        </form>
      </section>

      <section className="surface split-surface">
        <div>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Contract Register</p>
              <h2>{pickLocalized(locale, 'سجل العقود', 'Contract Register')}</h2>
            </div>
          </div>
          <div className="list-grid">
            {data?.contracts.map((contract) => (
              <article key={contract.id} className="list-card">
                <div className="list-card-head">
                  <strong>{contract.number || `CTR-${contract.id}`}</strong>
                  <span className="status-pill">{contract.status}</span>
                </div>
                <span>{contract.title}</span>
                <span className="muted">{shortDate(contract.startDate)} - {shortDate(contract.endDate)}</span>
                <span className="muted">
                  {pickLocalized(locale, 'القيمة', 'Value')}: {money(contract.value)} KWD
                </span>
                <button type="button" className="ghost-button" onClick={() => setSelectedContractId(contract.id)}>
                  {pickLocalized(locale, 'عرض التفاصيل', 'View Details')}
                </button>
              </article>
            ))}
            {!data?.contracts.length ? <div className="empty-state">{pickLocalized(locale, 'لا توجد عقود', 'No contracts found')}</div> : null}
          </div>
        </div>

        <div className="form-card">
          <div className="surface-header">
            <div>
              <p className="eyebrow">Details</p>
              <h2>{pickLocalized(locale, 'تفاصيل العقد', 'Contract Details')}</h2>
            </div>
            {selectedContract?.status === 'DRAFT' ? (
              <button type="button" className="primary-button" onClick={() => void handleApproveContract()} disabled={submitting === 'approve'}>
                {submitting === 'approve'
                  ? pickLocalized(locale, 'جارٍ الاعتماد...', 'Approving...')
                  : pickLocalized(locale, 'اعتماد العقد', 'Approve Contract')}
              </button>
            ) : null}
          </div>

          {selectedContract ? (
            <div className="list-grid">
              <article className="list-card">
                <div className="list-card-head">
                  <strong>{selectedContract.number || `CTR-${selectedContract.id}`}</strong>
                  <span className="status-pill">{selectedContract.status}</span>
                </div>
                <span>{selectedContract.title}</span>
                <span className="muted">
                  {pickLocalized(locale, 'النوع', 'Type')}: {selectedContract.type || '-'}
                </span>
                <span className="muted">
                  {pickLocalized(locale, 'تواريخ العقد', 'Dates')}: {shortDate(selectedContract.startDate)} - {shortDate(selectedContract.endDate)}
                </span>
                <span>
                  {pickLocalized(locale, 'القيمة', 'Value')}: {money(selectedContract.value)} KWD
                </span>
                <span className="muted">
                  {selectedContract.terms || pickLocalized(locale, 'لا توجد شروط مسجلة', 'No contract terms')}
                </span>
              </article>

              {(selectedContract.projects ?? []).map((project) => (
                <article key={project.id} className="list-card">
                  <div className="list-card-head">
                    <strong>{project.code || `PRJ-${project.id}`}</strong>
                    <span className="status-pill">{project.status || 'N/A'}</span>
                  </div>
                  <span>{project.nameAr || pickLocalized(locale, 'مشروع', 'Project')}</span>
                </article>
              ))}

              {!(selectedContract.projects ?? []).length ? (
                <div className="empty-state">{pickLocalized(locale, 'لا يوجد مشروع مرتبط بعد', 'No linked project yet')}</div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">{pickLocalized(locale, 'اختر عقداً لعرض التفاصيل', 'Select a contract to view details')}</div>
          )}
        </div>
      </section>

      <section className="surface split-surface">
        <form className="form-card" onSubmit={handleCreateMilestone}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Milestones</p>
              <h2>{pickLocalized(locale, 'إضافة مرحلة عقد', 'Add Contract Milestone')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'العنوان', 'Title')}</span>
              <input required value={milestoneForm.title} onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'تاريخ الاستحقاق', 'Due Date')}</span>
              <input type="date" value={milestoneForm.dueDate} onChange={(event) => setMilestoneForm((current) => ({ ...current, dueDate: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'المبلغ', 'Amount')}</span>
              <input type="number" step="0.001" value={milestoneForm.amount} onChange={(event) => setMilestoneForm((current) => ({ ...current, amount: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
              <select value={milestoneForm.status} onChange={(event) => setMilestoneForm((current) => ({ ...current, status: event.target.value }))} disabled={!selectedContractId}>
                <option value="PLANNED">PLANNED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
              <input value={milestoneForm.notes} onChange={(event) => setMilestoneForm((current) => ({ ...current, notes: event.target.value }))} disabled={!selectedContractId} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'milestone' || !selectedContractId}>
            {submitting === 'milestone' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إضافة المرحلة', 'Add Milestone')}
          </button>
          <div className="list-grid" style={{ marginTop: '1rem' }}>
            {milestones.map((milestone) => (
              <article key={milestone.id} className="list-card">
                <div className="list-card-head">
                  <strong>{milestone.title}</strong>
                  <span className="status-pill">{milestone.status || 'N/A'}</span>
                </div>
                <span className="muted">{shortDate(milestone.dueDate)}</span>
                <span>{pickLocalized(locale, 'المبلغ', 'Amount')}: {money(milestone.amount)} KWD</span>
              </article>
            ))}
            {!milestones.length ? <div className="empty-state">{pickLocalized(locale, 'لا توجد مراحل للعقد', 'No milestones for this contract')}</div> : null}
          </div>
        </form>

        <form className="form-card" onSubmit={handleConvertToProject}>
          <div className="surface-header">
            <div>
              <p className="eyebrow">Project Conversion</p>
              <h2>{pickLocalized(locale, 'تحويل العقد إلى مشروع', 'Convert Contract to Project')}</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>{pickLocalized(locale, 'اسم المشروع بالعربية', 'Project Name (AR)')}</span>
              <input value={convertProjectForm.nameAr} onChange={(event) => setConvertProjectForm((current) => ({ ...current, nameAr: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'اسم المشروع بالإنجليزية', 'Project Name (EN)')}</span>
              <input value={convertProjectForm.nameEn} onChange={(event) => setConvertProjectForm((current) => ({ ...current, nameEn: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'حالة المشروع', 'Project Status')}</span>
              <select value={convertProjectForm.status} onChange={(event) => setConvertProjectForm((current) => ({ ...current, status: event.target.value }))} disabled={!selectedContractId}>
                <option value="PLANNED">PLANNED</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </label>
            <label>
              <span>{pickLocalized(locale, 'الميزانية', 'Budget')}</span>
              <input type="number" step="0.001" value={convertProjectForm.budget} onChange={(event) => setConvertProjectForm((current) => ({ ...current, budget: event.target.value }))} disabled={!selectedContractId} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span>{pickLocalized(locale, 'الوصف', 'Description')}</span>
              <input value={convertProjectForm.description} onChange={(event) => setConvertProjectForm((current) => ({ ...current, description: event.target.value }))} disabled={!selectedContractId} />
            </label>
          </div>
          <button type="submit" className="primary-button" disabled={submitting === 'project' || !selectedContractId}>
            {submitting === 'project'
              ? pickLocalized(locale, 'جارٍ التحويل...', 'Converting...')
              : pickLocalized(locale, 'تحويل إلى مشروع', 'Convert to Project')}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
