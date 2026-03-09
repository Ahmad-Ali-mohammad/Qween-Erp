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
  nameAr?: string | null;
};

type OpportunityRow = {
  id: number;
  title: string;
  customerId?: number | null;
  stage?: string | null;
  status?: string | null;
  value?: number | string | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
};

type ContractRow = {
  id: number;
  number?: string | null;
  title: string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  value?: number | string | null;
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

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);

  const [opportunityForm, setOpportunityForm] = useState({
    title: '',
    customerId: '',
    value: '',
    probability: '20'
  });

  const [contractForm, setContractForm] = useState({
    title: '',
    partyType: 'CUSTOMER',
    partyId: '',
    startDate: new Date().toISOString().slice(0, 10),
    value: ''
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [customersRes, opportunitiesRes, contractsRes] = await Promise.all([
        getJson<CustomerRow[]>('/crm/customers?limit=200'),
        getJson<OpportunityRow[]>('/crm/opportunities?limit=50'),
        getJson<ContractRow[]>('/crm/contracts?limit=50')
      ]);
      setCustomers(customersRes.data);
      setOpportunities(opportunitiesRes.data);
      setContracts(contractsRes.data);
      setSelectedOpportunityId((current) => current ?? opportunitiesRes.data[0]?.id ?? null);
      setSelectedContractId((current) => current ?? contractsRes.data[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load CRM data');
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

  async function handleCreateOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-opportunity');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<OpportunityRow>('/crm/opportunities', {
        title: opportunityForm.title,
        customerId: opportunityForm.customerId ? Number(opportunityForm.customerId) : undefined,
        value: opportunityForm.value ? Number(opportunityForm.value) : undefined,
        probability: Number(opportunityForm.probability),
        stage: 'LEAD',
        status: 'OPEN'
      });
      setOpportunityForm({
        title: '',
        customerId: '',
        value: '',
        probability: '20'
      });
      setSelectedOpportunityId(created.data.id);
      setMessage('Opportunity created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create opportunity');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-contract');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<ContractRow>('/crm/contracts', {
        title: contractForm.title,
        partyType: contractForm.partyType,
        partyId: contractForm.partyId ? Number(contractForm.partyId) : undefined,
        startDate: contractForm.startDate,
        value: contractForm.value ? Number(contractForm.value) : undefined,
        status: 'DRAFT'
      });
      setContractForm({
        title: '',
        partyType: 'CUSTOMER',
        partyId: '',
        startDate: new Date().toISOString().slice(0, 10),
        value: ''
      });
      setSelectedContractId(created.data.id);
      setMessage('Contract created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create contract');
    } finally {
      setSubmitting(null);
    }
  }

  async function convertOpportunityToContract(id: number) {
    setSubmitting(`convert-opportunity-${id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await postJson<{ duplicate?: boolean; contractId?: number; contractNumber?: string }>(
        `/crm/opportunities/${id}/convert-to-contract`,
        {}
      );
      setMessage(
        result.data.duplicate
          ? `Opportunity already converted to contract ${result.data.contractNumber ?? ''}`.trim()
          : `Converted to contract ${result.data.contractNumber ?? ''}`.trim()
      );
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to convert opportunity');
    } finally {
      setSubmitting(null);
    }
  }

  async function convertContractToProject(id: number) {
    setSubmitting(`convert-contract-${id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await postJson<{ duplicate?: boolean; projectId?: number; projectCode?: string }>(
        `/crm/contracts/${id}/convert-to-project`,
        {}
      );
      setMessage(
        result.data.duplicate
          ? `Contract already linked to project ${result.data.projectCode ?? ''}`.trim()
          : `Converted to project ${result.data.projectCode ?? ''}`.trim()
      );
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to convert contract');
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) return null;

  const openOpportunities = opportunities.filter((row) => (row.status ?? 'OPEN').toUpperCase() !== 'WON').length;
  const activeContracts = contracts.filter((row) => (row.status ?? '').toUpperCase() === 'ACTIVE').length;

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
      <SectionCard title={pickLocalized(locale, 'CRM Overview', 'CRM Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Customers', 'Customers')}</span>
            <strong>{customers.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Open Opportunities', 'Open Opportunities')}</span>
            <strong>{openOpportunities}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Contracts', 'Contracts')}</span>
            <strong>{contracts.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Active Contracts', 'Active Contracts')}</span>
            <strong>{activeContracts}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading CRM data...', 'Loading CRM data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Opportunity', 'Create Opportunity')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateOpportunity}>
          <label>
            <span>{pickLocalized(locale, 'Title', 'Title')}</span>
            <input required value={opportunityForm.title} onChange={(event) => setOpportunityForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Customer', 'Customer')}</span>
            <select value={opportunityForm.customerId} onChange={(event) => setOpportunityForm((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No customer', 'No customer')}</option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `CUS-${row.id}`) + ' - ' + (row.nameAr ?? 'Customer')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Expected Value', 'Expected Value')}</span>
            <input type="number" step="0.001" value={opportunityForm.value} onChange={(event) => setOpportunityForm((current) => ({ ...current, value: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Probability %', 'Probability %')}</span>
            <input
              type="number"
              min="0"
              max="100"
              value={opportunityForm.probability}
              onChange={(event) => setOpportunityForm((current) => ({ ...current, probability: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-opportunity'}>
            {submitting === 'create-opportunity' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Opportunity', 'Create Opportunity')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Create Contract', 'Create Contract')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateContract}>
          <label>
            <span>{pickLocalized(locale, 'Title', 'Title')}</span>
            <input required value={contractForm.title} onChange={(event) => setContractForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Party Type', 'Party Type')}</span>
            <select value={contractForm.partyType} onChange={(event) => setContractForm((current) => ({ ...current, partyType: event.target.value }))}>
              <option value="CUSTOMER">CUSTOMER</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Party', 'Party')}</span>
            <select value={contractForm.partyId} onChange={(event) => setContractForm((current) => ({ ...current, partyId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No party', 'No party')}</option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `CUS-${row.id}`) + ' - ' + (row.nameAr ?? 'Customer')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Start Date', 'Start Date')}</span>
            <input
              type="date"
              required
              value={contractForm.startDate}
              onChange={(event) => setContractForm((current) => ({ ...current, startDate: event.target.value }))}
            />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Contract Value', 'Contract Value')}</span>
            <input type="number" step="0.001" value={contractForm.value} onChange={(event) => setContractForm((current) => ({ ...current, value: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-contract'}>
            {submitting === 'create-contract' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Contract', 'Create Contract')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Opportunities', 'Opportunities')} eyebrow="Pipeline">
        <div className="ui-list">
          {opportunities.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{row.title}</strong>
                <p className="ui-muted">
                  {(row.stage ?? 'LEAD') + ' - ' + (row.status ?? 'OPEN')} | {money(row.value)} KWD | {shortDate(row.expectedCloseDate)}
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedOpportunityId(row.id)}>
                  {row.id === selectedOpportunityId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void convertOpportunityToContract(row.id)}
                  disabled={submitting === `convert-opportunity-${row.id}`}
                >
                  {submitting === `convert-opportunity-${row.id}` ? pickLocalized(locale, 'Converting...', 'Converting...') : pickLocalized(locale, 'Convert to Contract', 'Convert to Contract')}
                </button>
              </div>
            </div>
          ))}
          {!opportunities.length ? <p className="ui-muted">{pickLocalized(locale, 'No opportunities yet', 'No opportunities yet')}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Contracts', 'Contracts')} eyebrow="Contracts">
        <div className="ui-list">
          {contracts.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{(row.number ?? `CTR-${row.id}`) + ' - ' + row.title}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'DRAFT') + ' | ' + money(row.value) + ' KWD'} | {shortDate(row.startDate)}
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedContractId(row.id)}>
                  {row.id === selectedContractId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void convertContractToProject(row.id)}
                  disabled={submitting === `convert-contract-${row.id}`}
                >
                  {submitting === `convert-contract-${row.id}` ? pickLocalized(locale, 'Converting...', 'Converting...') : pickLocalized(locale, 'Convert to Project', 'Convert to Project')}
                </button>
              </div>
            </div>
          ))}
          {!contracts.length ? <p className="ui-muted">{pickLocalized(locale, 'No contracts yet', 'No contracts yet')}</p> : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
