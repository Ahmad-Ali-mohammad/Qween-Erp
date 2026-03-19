import { api, extractRows, withToast } from '../../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table } from '../../core/ui.js';
import { escapeHtml, lineRowsHtml, parseLineRows } from '../shared/section-helpers.js';

export async function renderPurchaseOrders() {
  setTitle('طلبات الشراء');
  setPageActions({});
  const view = document.getElementById('view');

  const [ordersRes, suppliersRes] = await Promise.all([api('/purchase-orders'), api('/suppliers')]);
  const rows = extractRows(ordersRes);
  const suppliers = extractRows(suppliersRes);
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, `${supplier.code} - ${supplier.nameAr}`]));

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء طلب شراء</h3>
      <form id="po-form" class="grid cols-2">
        <div><label>المورد</label>
          <select name="supplierId" required>
            <option value="">اختر المورد</option>
            ${suppliers.map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.code)} - ${escapeHtml(supplier.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>تاريخ متوقع</label><input name="expectedDate" type="date" /></div>
        <div style="grid-column:1/-1;"><label>ملاحظات</label><input name="notes" /></div>
        <div style="grid-column:1/-1;"><h4>بنود الطلب</h4>${lineRowsHtml()}</div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ الطلب</button></div>
      </form>
    </div>
    <div class="card">
      <h3>قائمة طلبات الشراء</h3>
      ${table(
        ['الرقم', 'المورد', 'التاريخ', 'الإجمالي', 'الحالة', 'إجراءات'],
        rows.map((row) => [
          row.number,
          supplierNames.get(row.supplierId) || row.supplierId || '-',
          formatDate(row.date),
          formatMoney(row.total || 0),
          statusBadge(row.status),
          `<div class="actions">
            ${row.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-approve="${row.id}">اعتماد</button>` : ''}
            ${row.status === 'APPROVED' ? `<button class="btn btn-secondary btn-sm" data-send="${row.id}">إرسال</button>` : ''}
            ${row.status === 'SENT' ? `<button class="btn btn-success btn-sm" data-convert="${row.id}">تحويل</button>` : ''}
            ${row.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${row.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('po-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      supplierId: Number(form.supplierId.value),
      expectedDate: form.expectedDate.value || undefined,
      notes: form.notes.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/purchase-orders', 'POST', payload), 'تم حفظ طلب الشراء');
    await renderPurchaseOrders();
  });

  const wireAction = (attribute, endpoint, message) => {
    view.querySelectorAll(`[data-${attribute}]`).forEach((button) => {
      button.addEventListener('click', async () => {
        await withToast(() => api(`/purchase-orders/${button.getAttribute(`data-${attribute}`)}${endpoint}`, 'POST'), message);
        await renderPurchaseOrders();
      });
    });
  };

  wireAction('approve', '/approve', 'تم اعتماد الطلب');
  wireAction('send', '/send', 'تم إرسال الطلب');
  wireAction('convert', '/convert', 'تم تحويل الطلب إلى فاتورة');

  view.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-orders/${button.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف الطلب');
      await renderPurchaseOrders();
    });
  });
}

export async function renderPurchaseReturns() {
  setTitle('مرتجعات المشتريات');
  setPageActions({});
  const view = document.getElementById('view');

  const [returnsRes, invoicesRes] = await Promise.all([api('/purchase-returns'), api('/invoices?type=PURCHASE&status=ISSUED&page=1&limit=200')]);
  const rows = extractRows(returnsRes);
  const invoices = extractRows(invoicesRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء مرتجع مشتريات</h3>
      <form id="pr-form" class="grid cols-2">
        <div><label>فاتورة الشراء</label>
          <select name="invoiceId" required>
            <option value="">اختر الفاتورة</option>
            ${invoices.map((invoice) => `<option value="${invoice.id}">${escapeHtml(invoice.number)} - ${escapeHtml(invoice.supplier?.nameAr || '')}</option>`).join('')}
          </select>
        </div>
        <div><label>السبب</label><input name="reason" /></div>
        <div style="grid-column:1/-1;"><h4>بنود المرتجع</h4>${lineRowsHtml()}</div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ المرتجع</button></div>
      </form>
    </div>
    <div class="card">
      <h3>قائمة مرتجعات المشتريات</h3>
      ${table(
        ['الرقم', 'الفاتورة', 'التاريخ', 'الإجمالي', 'الحالة', 'إجراءات'],
        rows.map((row) => [
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

  document.getElementById('pr-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      invoiceId: Number(form.invoiceId.value),
      reason: form.reason.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/purchase-returns', 'POST', payload), 'تم حفظ مرتجع المشتريات');
    await renderPurchaseReturns();
  });

  view.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-returns/${button.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد المرتجع');
      await renderPurchaseReturns();
    });
  });

  view.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-returns/${button.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف المرتجع');
      await renderPurchaseReturns();
    });
  });
}
