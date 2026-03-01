import { request, withToast, extractRows } from '../core/api.js';
import {
  setTitle,
  table,
  formatMoney,
  formatDate,
  statusBadge,
  confirmAction,
  setPageActions
} from '../core/ui.js';

export async function renderPayments(mode = 'RECEIPT') {
  const isReceipt = mode === 'RECEIPT';
  setTitle(isReceipt ? 'سندات القبض' : 'سندات الدفع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل بيانات المدفوعات...</div>';

  const state = {
    search: ''
  };

  const load = async () => {
    const [paymentsRes, partiesRes, banksRes, invoicesRes] = await Promise.all([
      request('/payments?page=1&limit=100'),
      request(isReceipt ? '/customers' : '/suppliers'),
      request('/banks'),
      request('/invoices?page=1&limit=200')
    ]);

    const payments = extractRows(paymentsRes).filter((p) => p.type === mode);
    const parties = extractRows(partiesRes);
    const banks = extractRows(banksRes);
    const invoices = extractRows(invoicesRes).filter((i) => i.type === (isReceipt ? 'SALES' : 'PURCHASE') && Number(i.outstanding) > 0);
    const filtered = state.search
      ? payments.filter((p) => [p.number, p.description, p.status].filter(Boolean).join(' ').toLowerCase().includes(state.search.toLowerCase()))
      : payments;

    view.innerHTML = `
      <div class="card">
        <div class="section-title"><h3>${isReceipt ? 'سند قبض جديد' : 'سند دفع جديد'}</h3></div>
        <form id="payment-form" class="grid-3">
          <div>
            <label>${isReceipt ? 'العميل' : 'المورد'}</label>
            <select id="pay-party" required>
              <option value="">اختر ${isReceipt ? 'العميل' : 'المورد'}</option>
              ${parties.map((p) => `<option value="${p.id}">${p.code} - ${p.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>التاريخ</label><input id="pay-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>المبلغ</label><input id="pay-amount" type="number" min="0.01" step="0.01" value="0" required /></div>
          <div>
            <label>طريقة الدفع</label>
            <select id="pay-method">
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">تحويل بنكي</option>
              <option value="CHECK">شيك</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>
          <div>
            <label>الحساب البنكي</label>
            <select id="pay-bankId">
              <option value="">بدون بنك</option>
              ${banks.map((b) => `<option value="${b.id}">${b.name} - ${b.accountNumber}</option>`).join('')}
            </select>
          </div>
          <div><label>رقم المرجع</label><input id="pay-ref" placeholder="TRX123456" /></div>

          <div style="grid-column:1 / -1;"><label>ملاحظات</label><input id="pay-notes" /></div>

          <div style="grid-column:1 / -1;">
            <div class="section-title"><h4>توزيع المبلغ على الفواتير</h4><button id="pay-auto-allocate" type="button" class="btn btn-secondary btn-sm">توزيع تلقائي</button></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>المتبقي</th><th>التوزيع</th></tr></thead>
                <tbody id="pay-alloc-body">
                  ${invoices
                    .map(
                      (inv) => `
                    <tr data-invoice-id="${inv.id}">
                      <td>${inv.number}</td>
                      <td>${formatDate(inv.date)}</td>
                      <td>${formatMoney(inv.outstanding)}</td>
                      <td><input class="alloc-input" type="number" min="0" step="0.01" max="${Number(inv.outstanding)}" value="0" /></td>
                    </tr>
                  `
                    )
                    .join('') || '<tr><td colspan="4" class="muted">لا توجد فواتير مفتوحة للتوزيع</td></tr>'}
                </tbody>
                <tfoot>
                  <tr><th colspan="2">إجمالي التوزيع</th><th id="alloc-total">0.00</th><th id="alloc-remaining">المتبقي: 0.00</th></tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">حفظ كمسودة</button>
            <button class="btn btn-success" id="pay-save-complete" type="button">حفظ واعتماد</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="toolbar">
          <h3>سجل ${isReceipt ? 'سندات القبض' : 'سندات الدفع'}</h3>
          <div class="actions">
            <input id="pay-search" placeholder="بحث" value="${state.search}" />
            <button id="pay-search-btn" class="btn btn-info btn-sm">بحث</button>
          </div>
        </div>

        ${table(
          ['رقم السند', 'التاريخ', isReceipt ? 'العميل' : 'المورد', 'المبلغ', 'الطريقة', 'الحالة', 'الإجراءات'],
          filtered.map((p) => [
            p.number,
            formatDate(p.date),
            p.customer?.nameAr || p.supplier?.nameAr || '-',
            formatMoney(p.amount),
            p.method,
            statusBadge(p.status),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${p.id}">عرض</button>
              ${p.status === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="complete" data-id="${p.id}">اعتماد</button>` : ''}
              ${p.status === 'PENDING' ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${p.id}">إلغاء</button>` : ''}
              ${p.status === 'PENDING' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${p.id}">حذف</button>` : ''}
            </div>`
          ])
        )}
      </div>
    `;

    const amountInput = document.getElementById('pay-amount');
    const allocBody = document.getElementById('pay-alloc-body');

    const recalcAllocation = () => {
      const amount = Number(amountInput.value || 0);
      const allocInputs = Array.from(allocBody.querySelectorAll('.alloc-input'));
      const sum = allocInputs.reduce((acc, input) => acc + Number(input.value || 0), 0);
      document.getElementById('alloc-total').textContent = sum.toFixed(2);
      document.getElementById('alloc-remaining').textContent = `المتبقي: ${(amount - sum).toFixed(2)}`;
      return sum;
    };

    allocBody.querySelectorAll('.alloc-input').forEach((input) => {
      input.addEventListener('input', recalcAllocation);
    });

    amountInput.addEventListener('input', recalcAllocation);

    document.getElementById('pay-auto-allocate').addEventListener('click', () => {
      let remaining = Number(amountInput.value || 0);
      const rows = Array.from(allocBody.querySelectorAll('tr[data-invoice-id]'));
      rows.forEach((row) => {
        const max = Number(row.querySelector('.alloc-input').getAttribute('max') || 0);
        const allocate = Math.max(0, Math.min(max, remaining));
        row.querySelector('.alloc-input').value = allocate.toFixed(2);
        remaining -= allocate;
      });
      recalcAllocation();
    });

    const collectAllocations = () => {
      const rows = Array.from(allocBody.querySelectorAll('tr[data-invoice-id]'));
      return rows
        .map((row) => ({
          invoiceId: Number(row.getAttribute('data-invoice-id')),
          amount: Number(row.querySelector('.alloc-input').value || 0)
        }))
        .filter((a) => a.amount > 0);
    };

    const savePayment = async (completeAfterSave = false) => {
      const payload = {
        type: mode,
        method: document.getElementById('pay-method').value,
        amount: Number(document.getElementById('pay-amount').value || 0),
        date: document.getElementById('pay-date').value,
        customerId: isReceipt ? Number(document.getElementById('pay-party').value || 0) || undefined : undefined,
        supplierId: !isReceipt ? Number(document.getElementById('pay-party').value || 0) || undefined : undefined,
        bankId: document.getElementById('pay-bankId').value ? Number(document.getElementById('pay-bankId').value) : undefined,
        description: document.getElementById('pay-ref').value || undefined,
        notes: document.getElementById('pay-notes').value || undefined,
        allocations: collectAllocations()
      };

      const created = await withToast(() => request('/payments', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ السند');
      if (completeAfterSave) {
        await withToast(() => request(`/payments/${created.data.id}/complete`, { method: 'POST' }), 'تم اعتماد السند');
      }

      await load();
    };

    document.getElementById('payment-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await savePayment(false);
    });

    document.getElementById('pay-save-complete').addEventListener('click', async () => {
      await savePayment(true);
    });

    document.getElementById('pay-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('pay-search').value.trim();
      await load();
    });

    view.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const details = await request(`/payments/${Number(btn.getAttribute('data-id'))}`);
        const allocations = (details.data.allocations || []).map((a) => `${a.invoice?.number || a.invoiceId}: ${formatMoney(a.amount)}`).join(' | ');
        alert(`السند ${details.data.number}\nالمبلغ: ${formatMoney(details.data.amount)}\nالتوزيع: ${allocations || 'لا يوجد توزيع'}`);
      });
    });

    view.querySelectorAll('[data-action="complete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/payments/${id}/complete`, { method: 'POST' }), 'تم اعتماد السند');
        await load();
      });
    });

    view.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم إلغاء السند وعكس توزيعاته. هل تريد المتابعة؟', 'إلغاء سند');
        if (!confirmed) return;
        await withToast(() => request(`/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled from UI' }) }), 'تم إلغاء السند');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف السند نهائياً. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/payments/${id}`, { method: 'DELETE' }), 'تم حذف السند');
        await load();
      });
    });

    recalcAllocation();

    setPageActions({
      onNew: () => document.getElementById('payment-form').reset(),
      onSave: () => document.getElementById('payment-form').requestSubmit(),
      onSearch: () => document.getElementById('pay-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
