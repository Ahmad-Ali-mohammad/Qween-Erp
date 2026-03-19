import { request, withToast, extractRows } from '../../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, confirmAction, setPageActions, toast } from '../../core/ui.js';
import { bindLookupField, renderLookupField, buildEntityLabel, formatIsoDate } from './document-workspace.js';

function normalizeAllocationRows(rows, paymentAmount) {
  const amount = Number(paymentAmount || 0);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    total,
    remaining: amount - total
  };
}

export async function renderPayments(mode = 'RECEIPT') {
  const isReceipt = mode === 'RECEIPT';
  setTitle(isReceipt ? 'سندات القبض' : 'سندات الدفع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مساحة السندات...</div>';

  const state = {
    editingId: null,
    selectedPartyId: '',
    search: '',
    date: formatIsoDate(),
    amount: 0,
    method: 'CASH',
    bankId: '',
    reference: '',
    notes: ''
  };

  const resetEditor = () => {
    state.editingId = null;
    state.selectedPartyId = '';
    state.date = formatIsoDate();
    state.amount = 0;
    state.method = 'CASH';
    state.bankId = '';
    state.reference = '';
    state.notes = '';
  };

  const load = async () => {
    const [paymentsRes, partiesRes, banksRes, invoicesRes] = await Promise.all([
      request('/payments?page=1&limit=100'),
      request(isReceipt ? '/customers?page=1&limit=500' : '/suppliers?page=1&limit=500'),
      request('/banks?page=1&limit=200'),
      request(`/invoices?page=1&limit=200&type=${isReceipt ? 'SALES' : 'PURCHASE'}`)
    ]);

    const payments = extractRows(paymentsRes).filter((payment) => payment.type === mode);
    const parties = extractRows(partiesRes);
    const banks = extractRows(banksRes);
    const invoices = extractRows(invoicesRes).filter((invoice) => Number(invoice.outstanding) > 0);

    const filteredPayments = payments.filter((payment) => {
      const partyName = payment.customer?.nameAr || payment.supplier?.nameAr || '';
      const haystack = [payment.number, payment.description, payment.status, partyName].filter(Boolean).join(' ').toLowerCase();
      return state.search ? haystack.includes(state.search.toLowerCase()) : true;
    });

    const visibleInvoices = state.selectedPartyId
      ? invoices.filter((invoice) =>
          isReceipt ? String(invoice.customerId || '') === state.selectedPartyId : String(invoice.supplierId || '') === state.selectedPartyId
        )
      : invoices.slice(0, 12);

    const stats = payments.reduce(
      (acc, payment) => {
        acc.total += Number(payment.amount || 0);
        acc.pending += payment.status === 'PENDING' ? 1 : 0;
        return acc;
      },
      { total: 0, pending: 0 }
    );

    view.innerHTML = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">${isReceipt ? 'التحصيل' : 'السداد'}</p>
          <h3>${isReceipt ? 'تهيئة سند قبض' : 'تهيئة سند دفع'}</h3>
          <p class="muted">اربط السند بالطرف الصحيح ثم وزّع المبلغ على الفواتير المفتوحة قبل الاعتماد.</p>
        </div>
        <div class="workflow-kpis">
          <div class="kpi"><div>إجمالي السندات</div><div class="val">${formatMoney(stats.total)}</div></div>
          <div class="kpi"><div>سندات معلقة</div><div class="val">${stats.pending}</div></div>
          <div class="kpi"><div>فواتير مفتوحة</div><div class="val">${visibleInvoices.length}</div></div>
        </div>
      </section>

      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>${isReceipt ? 'بطاقة سند القبض' : 'بطاقة سند الدفع'}</h3>
            <button id="payment-new" class="btn btn-secondary" type="button">سند جديد</button>
          </div>

          <form id="payment-form" class="grid-3">
            ${renderLookupField({
              inputId: 'payment-party-input',
              hiddenId: 'payment-party-id',
              listId: 'payment-party-list',
              label: isReceipt ? 'العميل' : 'المورد',
              placeholder: isReceipt ? 'ابحث باسم العميل أو رمزه' : 'ابحث باسم المورد أو رمزه',
              entities: parties,
              selectedId: state.selectedPartyId
            })}
            <div><label>التاريخ</label><input id="payment-date" type="date" value="${state.date}" required /></div>
            <div><label>المبلغ</label><input id="payment-amount" type="number" min="0.01" step="0.01" value="${state.amount}" required /></div>

            <div>
              <label>طريقة الدفع</label>
              <select id="payment-method">
                <option value="CASH" ${state.method === 'CASH' ? 'selected' : ''}>نقدي</option>
                <option value="BANK_TRANSFER" ${state.method === 'BANK_TRANSFER' ? 'selected' : ''}>تحويل بنكي</option>
                <option value="CHECK" ${state.method === 'CHECK' ? 'selected' : ''}>شيك</option>
                <option value="CARD" ${state.method === 'CARD' ? 'selected' : ''}>بطاقة</option>
              </select>
            </div>
            <div>
              <label>الحساب البنكي</label>
              <select id="payment-bank-id">
                <option value="">بدون بنك</option>
                ${banks.map((bank) => `<option value="${bank.id}" ${String(bank.id) === String(state.bankId) ? 'selected' : ''}>${bank.name} - ${bank.accountNumber}</option>`).join('')}
              </select>
            </div>
            <div><label>رقم المرجع</label><input id="payment-reference" value="${state.reference}" placeholder="TRX-001" /></div>

            <div style="grid-column:1 / -1;">
              <label>ملاحظات</label>
              <textarea id="payment-notes" rows="3" placeholder="تفاصيل إضافية أو ملاحظات تسوية">${state.notes}</textarea>
            </div>

            <div style="grid-column:1 / -1;">
              <div class="section-title">
                <h4>توزيع المبلغ على الفواتير</h4>
                <div class="actions">
                  <button id="payment-refresh-invoices" type="button" class="btn btn-secondary btn-sm">تحديث القائمة</button>
                  <button id="payment-auto-allocate" type="button" class="btn btn-primary btn-sm">توزيع تلقائي</button>
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الفاتورة</th>
                      <th>التاريخ</th>
                      <th>${isReceipt ? 'العميل' : 'المورد'}</th>
                      <th>المتبقي</th>
                      <th>التوزيع</th>
                    </tr>
                  </thead>
                  <tbody id="payment-allocation-body">
                    ${
                      visibleInvoices.length
                        ? visibleInvoices
                            .map(
                              (invoice) => `
                                <tr data-invoice-id="${invoice.id}">
                                  <td>${invoice.number}</td>
                                  <td>${formatDate(invoice.date)}</td>
                                  <td>${invoice.customer?.nameAr || invoice.supplier?.nameAr || '-'}</td>
                                  <td>${formatMoney(invoice.outstanding)}</td>
                                  <td><input class="allocation-input" type="number" min="0" step="0.01" max="${Number(invoice.outstanding)}" value="0" /></td>
                                </tr>
                              `
                            )
                            .join('')
                        : '<tr><td colspan="5" class="muted">اختر الطرف أولاً لعرض الفواتير المفتوحة المرتبطة به.</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="workflow-summary-panel" style="grid-column:1 / -1;">
              <div class="kpi"><div>إجمالي التوزيع</div><div id="payment-allocation-total" class="val">0.00</div></div>
              <div class="kpi"><div>المتبقي غير موزع</div><div id="payment-allocation-remaining" class="val">${Number(state.amount).toFixed(2)}</div></div>
              <div class="kpi"><div>طريقة الدفع</div><div id="payment-method-preview" class="val">${state.method}</div></div>
            </div>

            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">حفظ كمسودة</button>
              <button class="btn btn-success" type="button" id="payment-save-complete">حفظ واعتماد</button>
            </div>
          </form>
        </article>

        <aside class="card workflow-side">
          <h3>سجل السندات</h3>
          <label>بحث</label>
          <input id="payment-search" placeholder="رقم، طرف، وصف" value="${state.search}" />
          <div class="actions" style="margin-top:10px;">
            <button id="payment-search-btn" class="btn btn-info btn-sm" type="button">تطبيق</button>
            <button id="payment-reset-filters" class="btn btn-secondary btn-sm" type="button">إعادة ضبط</button>
          </div>
        </aside>
      </section>

      <section class="card">
        <div class="section-title">
          <h3>${isReceipt ? 'سجل سندات القبض' : 'سجل سندات الدفع'}</h3>
          <span class="muted">${filteredPayments.length} عنصر مطابق</span>
        </div>
        ${table(
          ['رقم السند', 'التاريخ', isReceipt ? 'العميل' : 'المورد', 'المبلغ', 'الطريقة', 'الحالة', 'الإجراءات'],
          filteredPayments.map((payment) => [
            payment.number,
            formatDate(payment.date),
            payment.customer?.nameAr || payment.supplier?.nameAr || '-',
            formatMoney(payment.amount),
            payment.method,
            statusBadge(payment.status),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${payment.id}">عرض</button>
              ${payment.status === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="complete" data-id="${payment.id}">اعتماد</button>` : ''}
              ${payment.status === 'PENDING' ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${payment.id}">إلغاء</button>` : ''}
              ${payment.status === 'PENDING' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${payment.id}">حذف</button>` : ''}
            </div>`
          ])
        )}
      </section>
    `;

    const partyField = bindLookupField({
      inputId: 'payment-party-input',
      hiddenId: 'payment-party-id',
      entities: parties,
      onResolved(match) {
        state.selectedPartyId = match ? String(match.id) : '';
      }
    });

    const amountInput = document.getElementById('payment-amount');
    const methodInput = document.getElementById('payment-method');
    const allocationBody = document.getElementById('payment-allocation-body');

    const collectAllocations = () =>
      Array.from(allocationBody.querySelectorAll('tr[data-invoice-id]'))
        .map((row) => ({
          invoiceId: Number(row.getAttribute('data-invoice-id')),
          amount: Number(row.querySelector('.allocation-input')?.value || 0)
        }))
        .filter((allocation) => allocation.amount > 0);

    const refreshAllocationSummary = () => {
      const allocations = collectAllocations();
      const summary = normalizeAllocationRows(allocations, Number(amountInput.value || 0));
      document.getElementById('payment-allocation-total').textContent = summary.total.toFixed(2);
      document.getElementById('payment-allocation-remaining').textContent = summary.remaining.toFixed(2);
      document.getElementById('payment-method-preview').textContent = methodInput.value;
      return summary;
    };

    allocationBody.querySelectorAll('.allocation-input').forEach((input) => {
      input.addEventListener('input', refreshAllocationSummary);
    });
    amountInput.addEventListener('input', refreshAllocationSummary);
    methodInput.addEventListener('change', refreshAllocationSummary);

    document.getElementById('payment-refresh-invoices').addEventListener('click', async () => {
      partyField.resolve();
      await load();
    });

    document.getElementById('payment-auto-allocate').addEventListener('click', () => {
      let remaining = Number(amountInput.value || 0);
      Array.from(allocationBody.querySelectorAll('tr[data-invoice-id]')).forEach((row) => {
        const input = row.querySelector('.allocation-input');
        const max = Number(input?.getAttribute('max') || 0);
        const allocation = Math.max(0, Math.min(max, remaining));
        if (input) input.value = allocation.toFixed(2);
        remaining -= allocation;
      });
      refreshAllocationSummary();
    });

    const savePayment = async (completeAfterSave = false) => {
      const party = partyField.resolve();
      const allocations = collectAllocations();
      const payload = {
        type: mode,
        method: document.getElementById('payment-method').value,
        amount: Number(document.getElementById('payment-amount').value || 0),
        date: document.getElementById('payment-date').value,
        customerId: isReceipt ? Number(document.getElementById('payment-party-id').value || 0) || undefined : undefined,
        supplierId: !isReceipt ? Number(document.getElementById('payment-party-id').value || 0) || undefined : undefined,
        bankId: document.getElementById('payment-bank-id').value ? Number(document.getElementById('payment-bank-id').value) : undefined,
        description: document.getElementById('payment-reference').value.trim() || undefined,
        notes: document.getElementById('payment-notes').value.trim() || undefined,
        allocations
      };

      if (!party) {
        toast(isReceipt ? 'اختر عميلًا صحيحًا قبل الحفظ' : 'اختر موردًا صحيحًا قبل الحفظ', 'warning');
        return;
      }

      const allocationSummary = refreshAllocationSummary();
      if (allocationSummary.remaining < -0.01) {
        toast('إجمالي التوزيع يتجاوز مبلغ السند', 'warning');
        return;
      }

      const created = await withToast(() => request('/payments', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ السند');
      if (completeAfterSave) {
        await withToast(
          () => request(`/payments/${created.data.id}/complete`, { method: 'POST', body: JSON.stringify({ allocations }) }),
          'تم اعتماد السند'
        );
      }

      resetEditor();
      await load();
    };

    document.getElementById('payment-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await savePayment(false);
    });
    document.getElementById('payment-save-complete').addEventListener('click', async () => savePayment(true));
    document.getElementById('payment-new').addEventListener('click', async () => {
      resetEditor();
      await load();
    });
    document.getElementById('payment-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('payment-search').value.trim();
      await load();
    });
    document.getElementById('payment-reset-filters').addEventListener('click', async () => {
      state.search = '';
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');

        if (action === 'view') {
          const details = await request(`/payments/${id}`);
          const allocationSummary = (details.data.allocations || [])
            .map((allocation) => `${allocation.invoice?.number || allocation.invoiceId}: ${formatMoney(allocation.amount)}`)
            .join(' | ');
          toast(`السند ${details.data.number} | ${allocationSummary || 'بدون توزيع'}`, 'info');
          return;
        }

        if (action === 'complete') {
          await withToast(() => request(`/payments/${id}/complete`, { method: 'POST', body: JSON.stringify({ allocations: [] }) }), 'تم اعتماد السند');
        }

        if (action === 'cancel') {
          const confirmed = await confirmAction('سيتم إلغاء السند وعكس توزيعاته. هل تريد المتابعة؟', 'إلغاء سند');
          if (!confirmed) return;
          await withToast(
            () => request(`/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled from UI' }) }),
            'تم إلغاء السند'
          );
        }

        if (action === 'delete') {
          const confirmed = await confirmAction('سيتم حذف السند نهائياً. هل تريد المتابعة؟');
          if (!confirmed) return;
          await withToast(() => request(`/payments/${id}`, { method: 'DELETE' }), 'تم حذف السند');
        }

        await load();
      });
    });

    refreshAllocationSummary();

    setPageActions({
      onNew: () => document.getElementById('payment-new').click(),
      onSave: () => document.getElementById('payment-form').requestSubmit(),
      onSearch: () => document.getElementById('payment-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
