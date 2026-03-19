import { api, extractRows, withToast } from '../../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table } from '../../core/ui.js';
import { escapeHtml, lineRowsHtml, parseLineRows } from '../shared/section-helpers.js';

export async function renderSalesReturns() {
  setTitle('مرتجعات المبيعات');
  setPageActions({});
  const view = document.getElementById('view');

  const [returnsRes, invoicesRes] = await Promise.all([api('/sales-returns'), api('/invoices?type=SALES&status=ISSUED&page=1&limit=200')]);
  const returns = extractRows(returnsRes);
  const invoices = extractRows(invoicesRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء مرتجع مبيعات</h3>
      <form id="sales-return-form" class="grid cols-2">
        <div><label>الفاتورة</label>
          <select name="invoiceId" required>
            <option value="">اختر الفاتورة</option>
            ${invoices.map((invoice) => `<option value="${invoice.id}">${escapeHtml(invoice.number)} - ${escapeHtml(invoice.customer?.nameAr || '')}</option>`).join('')}
          </select>
        </div>
        <div><label>السبب</label><input name="reason" /></div>
        <div style="grid-column:1/-1;"><h4>بنود المرتجع</h4>${lineRowsHtml()}</div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ المرتجع</button></div>
      </form>
    </div>
    <div class="card">
      <h3>قائمة مرتجعات المبيعات</h3>
      ${table(
        ['الرقم', 'الفاتورة', 'التاريخ', 'الإجمالي', 'الحالة', 'إجراءات'],
        returns.map((row) => [
          row.number,
          row.invoiceId || '-',
          formatDate(row.date),
          formatMoney(row.total || 0),
          statusBadge(row.status),
          `<div class="actions">
            ${row.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-approve="${row.id}">اعتماد</button>` : ''}
            ${row.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${row.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('sales-return-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      invoiceId: Number(form.invoiceId.value),
      reason: form.reason.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/sales-returns', 'POST', payload), 'تم حفظ المرتجع');
    await renderSalesReturns();
  });

  view.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/sales-returns/${button.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد المرتجع');
      await renderSalesReturns();
    });
  });

  view.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/sales-returns/${button.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف المرتجع');
      await renderSalesReturns();
    });
  });
}
