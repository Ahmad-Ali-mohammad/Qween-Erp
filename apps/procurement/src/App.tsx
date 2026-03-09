import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type PurchaseRequestRow = {
  id: number;
  number?: string | null;
  supplierId?: number | null;
  projectId?: number | null;
  status?: string | null;
  date?: string | null;
  total?: number | string | null;
};

type PurchaseOrderRow = {
  id: number;
  number?: string | null;
  supplierId?: number | null;
  projectId?: number | null;
  status?: string | null;
  date?: string | null;
  total?: number | string | null;
};

type ReceiptRow = {
  id: number;
  number?: string | null;
  purchaseOrderId?: number | null;
  status?: string | null;
  date?: string | null;
};

type VendorInvoiceRow = {
  id: number;
  number?: string | null;
  supplierId?: number | null;
  status?: string | null;
  date?: string | null;
  total?: number | string | null;
};

type SupplierRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
};

type ProjectRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
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

  const [requests, setRequests] = useState<PurchaseRequestRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<VendorInvoiceRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);

  const [requestForm, setRequestForm] = useState({
    supplierId: '',
    projectId: '',
    description: '',
    quantity: '1',
    unitPrice: '0'
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [requestsRes, ordersRes, receiptsRes, invoicesRes, suppliersRes, projectsRes] = await Promise.all([
        getJson<PurchaseRequestRow[]>('/procurement/requests?limit=50'),
        getJson<PurchaseOrderRow[]>('/procurement/orders?limit=50'),
        getJson<ReceiptRow[]>('/procurement/receipts?limit=50'),
        getJson<VendorInvoiceRow[]>('/procurement/vendor-invoices?limit=50'),
        getJson<SupplierRow[]>('/suppliers'),
        getJson<ProjectRow[]>('/projects?limit=100')
      ]);

      setRequests(requestsRes.data);
      setOrders(ordersRes.data);
      setReceipts(receiptsRes.data);
      setVendorInvoices(invoicesRes.data);
      setSuppliers(suppliersRes.data);
      setProjects(projectsRes.data);
      setSelectedRequestId((current) => current ?? requestsRes.data[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load procurement data');
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

  async function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('create-request');
    setMessage(null);
    setError(null);
    try {
      const created = await postJson<PurchaseRequestRow>('/procurement/requests', {
        supplierId: requestForm.supplierId ? Number(requestForm.supplierId) : undefined,
        projectId: requestForm.projectId ? Number(requestForm.projectId) : undefined,
        lines: [
          {
            description: requestForm.description,
            quantity: Number(requestForm.quantity),
            unitPrice: Number(requestForm.unitPrice),
            taxRate: 15
          }
        ]
      });
      setRequestForm({
        supplierId: '',
        projectId: '',
        description: '',
        quantity: '1',
        unitPrice: '0'
      });
      setSelectedRequestId(created.data.id);
      setMessage('Purchase request created');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create purchase request');
    } finally {
      setSubmitting(null);
    }
  }

  async function approveRequest(id: number) {
    setSubmitting(`approve-${id}`);
    setMessage(null);
    setError(null);
    try {
      await postJson<PurchaseRequestRow>(`/procurement/requests/${id}/approve`, {});
      setMessage('Purchase request approved');
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to approve purchase request');
    } finally {
      setSubmitting(null);
    }
  }

  async function convertRequestToOrder(id: number, supplierId?: number | null) {
    setSubmitting(`convert-${id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await postJson<{ duplicate?: boolean; purchaseOrderNumber?: string }>(
        `/procurement/requests/${id}/convert-to-order`,
        {
          supplierId: supplierId ?? undefined
        }
      );
      setMessage(
        result.data.duplicate
          ? `Request already converted to order ${result.data.purchaseOrderNumber ?? ''}`.trim()
          : `Converted to order ${result.data.purchaseOrderNumber ?? ''}`.trim()
      );
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to convert request');
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
      <SectionCard title={pickLocalized(locale, 'Procurement Overview', 'Procurement Overview')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Purchase Requests', 'Purchase Requests')}</span>
            <strong>{requests.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Purchase Orders', 'Purchase Orders')}</span>
            <strong>{orders.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Receipts', 'Receipts')}</span>
            <strong>{receipts.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'Vendor Invoices', 'Vendor Invoices')}</span>
            <strong>{vendorInvoices.length}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'Loading procurement data...', 'Loading procurement data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'Create Purchase Request', 'Create Purchase Request')} eyebrow="Create">
        <form className="ui-form" onSubmit={handleCreateRequest}>
          <label>
            <span>{pickLocalized(locale, 'Supplier', 'Supplier')}</span>
            <select value={requestForm.supplierId} onChange={(event) => setRequestForm((current) => ({ ...current, supplierId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No supplier', 'No supplier')}</option>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `SUP-${row.id}`) + ' - ' + (row.nameAr ?? 'Supplier')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Project', 'Project')}</span>
            <select value={requestForm.projectId} onChange={(event) => setRequestForm((current) => ({ ...current, projectId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'No project', 'No project')}</option>
              {projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {(row.code ?? `PRJ-${row.id}`) + ' - ' + (row.nameAr ?? 'Project')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'Description', 'Description')}</span>
            <input required value={requestForm.description} onChange={(event) => setRequestForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Quantity', 'Quantity')}</span>
            <input type="number" step="0.001" required value={requestForm.quantity} onChange={(event) => setRequestForm((current) => ({ ...current, quantity: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'Unit Price', 'Unit Price')}</span>
            <input type="number" step="0.001" required value={requestForm.unitPrice} onChange={(event) => setRequestForm((current) => ({ ...current, unitPrice: event.target.value }))} />
          </label>
          <button type="submit" className="ui-button" disabled={submitting === 'create-request'}>
            {submitting === 'create-request' ? pickLocalized(locale, 'Saving...', 'Saving...') : pickLocalized(locale, 'Create Request', 'Create Request')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Purchase Requests', 'Purchase Requests')} eyebrow="Requests">
        <div className="ui-list">
          {requests.map((row) => (
            <div className="ui-list-item" key={row.id}>
              <div>
                <strong>{row.number ?? `PR-${row.id}`}</strong>
                <p className="ui-muted">
                  {(row.status ?? 'DRAFT') + ' | ' + shortDate(row.date)} | {money(row.total)} KWD
                </p>
              </div>
              <div className="ui-actions">
                <button type="button" className="ui-link" onClick={() => setSelectedRequestId(row.id)}>
                  {row.id === selectedRequestId ? pickLocalized(locale, 'Selected', 'Selected') : pickLocalized(locale, 'Select', 'Select')}
                </button>
                <button type="button" className="ui-link" onClick={() => void approveRequest(row.id)} disabled={submitting === `approve-${row.id}`}>
                  {submitting === `approve-${row.id}` ? pickLocalized(locale, 'Approving...', 'Approving...') : pickLocalized(locale, 'Approve', 'Approve')}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void convertRequestToOrder(row.id, row.supplierId)}
                  disabled={submitting === `convert-${row.id}`}
                >
                  {submitting === `convert-${row.id}` ? pickLocalized(locale, 'Converting...', 'Converting...') : pickLocalized(locale, 'Convert to Order', 'Convert to Order')}
                </button>
              </div>
            </div>
          ))}
          {!requests.length ? <p className="ui-muted">{pickLocalized(locale, 'No purchase requests yet', 'No purchase requests yet')}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'Orders / Receipts / Vendor Invoices', 'Orders / Receipts / Vendor Invoices')} eyebrow="Execution">
        <div className="ui-grid">
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Orders', 'Orders')}</p>
            <div className="ui-list">
              {orders.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.number ?? `PO-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + money(row.total) + ' KWD'}</p>
                  </div>
                </div>
              ))}
              {!orders.length ? <p className="ui-muted">{pickLocalized(locale, 'No orders yet', 'No orders yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Receipts', 'Receipts')}</p>
            <div className="ui-list">
              {receipts.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.number ?? `GRN-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + shortDate(row.date)}</p>
                  </div>
                </div>
              ))}
              {!receipts.length ? <p className="ui-muted">{pickLocalized(locale, 'No receipts yet', 'No receipts yet')}</p> : null}
            </div>
          </div>
          <div className="ui-card">
            <p className="ui-eyebrow">{pickLocalized(locale, 'Vendor Invoices', 'Vendor Invoices')}</p>
            <div className="ui-list">
              {vendorInvoices.slice(0, 10).map((row) => (
                <div className="ui-list-item" key={row.id}>
                  <div>
                    <strong>{row.number ?? `PINV-${row.id}`}</strong>
                    <p className="ui-muted">{(row.status ?? 'DRAFT') + ' | ' + money(row.total) + ' KWD'}</p>
                  </div>
                </div>
              ))}
              {!vendorInvoices.length ? <p className="ui-muted">{pickLocalized(locale, 'No vendor invoices yet', 'No vendor invoices yet')}</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
