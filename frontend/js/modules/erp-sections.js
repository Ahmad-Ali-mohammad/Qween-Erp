import { renderModuleShell } from './module-shell.js';
import { table, setTitle, setPageActions, toast, formatMoney, formatDate, statusBadge } from '../core/ui.js';
import { api, extractRows, extractData, toQuery, withToast } from '../core/api.js';

const titles = {
  '/sales-quotes': 'عروض الأسعار',
  '/sales-returns': 'مرتجعات المبيعات',
  '/sales-reports': 'تقارير المبيعات',
  '/purchase-orders': 'طلبات الشراء',
  '/purchase-returns': 'مرتجعات المشتريات',
  '/purchase-reports': 'تقارير المشتريات',
  '/items': 'الأصناف',
  '/item-categories': 'تصنيفات الأصناف',
  '/units': 'الوحدات',
  '/warehouses': 'المستودعات',
  '/stock-counts': 'جرد المخزون',
  '/stock-movements': 'حركات المخزون',
  '/inventory-reports': 'تقارير المخزون'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadCsv(filename, headers, rows) {
  const body = [headers, ...rows]
    .map((line) =>
      line
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function lineRowsHtml() {
  return `
    <div class="line-rows" id="line-rows">
      <div class="line-row grid cols-5" style="margin-bottom:8px;">
        <input name="lineDescription" placeholder="الوصف" required />
        <input name="lineQty" type="number" min="0.01" step="0.01" value="1" required />
        <input name="linePrice" type="number" min="0" step="0.01" value="0" required />
        <input name="lineDiscount" type="number" min="0" step="0.01" value="0" />
        <input name="lineTaxRate" type="number" min="0" max="100" step="0.01" value="15" />
      </div>
    </div>
  `;
}

function parseLineRows(form) {
  const rows = [...form.querySelectorAll('.line-row')];
  const lines = rows
    .map((row) => ({
      description: row.querySelector('[name="lineDescription"]')?.value?.trim(),
      quantity: Number(row.querySelector('[name="lineQty"]')?.value || 0),
      unitPrice: Number(row.querySelector('[name="linePrice"]')?.value || 0),
      discount: Number(row.querySelector('[name="lineDiscount"]')?.value || 0),
      taxRate: Number(row.querySelector('[name="lineTaxRate"]')?.value || 15)
    }))
    .filter((line) => line.description && line.quantity > 0);
  if (!lines.length) throw new Error('يجب إضافة بند واحد على الأقل');
  return lines;
}

async function renderSalesQuotes() {
  setTitle('عروض الأسعار');
  setPageActions({});
  const view = document.getElementById('view');
  const [quotesRes, customersRes] = await Promise.all([api('/quotes'), api('/customers')]);
  const quotes = extractRows(quotesRes);
  const customers = extractRows(customersRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء عرض سعر</h3>
      <form id="quote-form" class="grid cols-2">
        <div><label>العميل</label>
          <select name="customerId" required>
            <option value="">اختر العميل</option>
            ${customers.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>صالح حتى</label><input name="validUntil" type="date" /></div>
        <div style="grid-column:1/-1;"><label>ملاحظات</label><input name="notes" /></div>
        <div style="grid-column:1/-1;"><h4>بنود العرض</h4>${lineRowsHtml()}</div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ العرض</button></div>
      </form>
    </div>
    <div class="card">
      <h3>قائمة عروض الأسعار</h3>
      ${table(
        ['الرقم', 'العميل', 'التاريخ', 'الإجمالي', 'الحالة', 'إجراءات'],
        quotes.map((q) => [
          q.number,
          q.customerId || '-',
          formatDate(q.date),
          formatMoney(q.total || 0),
          statusBadge(q.status),
          `<div class="actions">
            ${q.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-send="${q.id}">إرسال</button>` : ''}
            ${['SENT', 'ACCEPTED'].includes(q.status) ? `<button class="btn btn-success btn-sm" data-convert="${q.id}">تحويل</button>` : ''}
            ${q.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${q.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('quote-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      customerId: Number(form.customerId.value),
      validUntil: form.validUntil.value || undefined,
      notes: form.notes.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/quotes', 'POST', payload), 'تم حفظ عرض السعر');
    await renderSalesQuotes();
  });

  view.querySelectorAll('[data-send]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/quotes/${btn.getAttribute('data-send')}/send`, 'POST'), 'تم إرسال العرض');
      await renderSalesQuotes();
    });
  });
  view.querySelectorAll('[data-convert]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/quotes/${btn.getAttribute('data-convert')}/convert`, 'POST'), 'تم تحويل العرض إلى فاتورة');
      await renderSalesQuotes();
    });
  });
  view.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/quotes/${btn.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف العرض');
      await renderSalesQuotes();
    });
  });
}

async function renderSalesReturns() {
  setTitle('مرتجعات المبيعات');
  setPageActions({});
  const view = document.getElementById('view');
  const [returnsRes, invoicesRes] = await Promise.all([
    api('/sales-returns'),
    api('/invoices?type=SALES&status=ISSUED&page=1&limit=200')
  ]);
  const returns = extractRows(returnsRes);
  const invoices = extractRows(invoicesRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء مرتجع مبيعات</h3>
      <form id="sales-return-form" class="grid cols-2">
        <div><label>الفاتورة</label>
          <select name="invoiceId" required>
            <option value="">اختر الفاتورة</option>
            ${invoices.map((inv) => `<option value="${inv.id}">${escapeHtml(inv.number)} - ${escapeHtml(inv.customer?.nameAr || '')}</option>`).join('')}
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
        returns.map((r) => [
          r.number,
          r.invoiceId || '-',
          formatDate(r.date),
          formatMoney(r.total || 0),
          statusBadge(r.status),
          `<div class="actions">
            ${r.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-approve="${r.id}">اعتماد</button>` : ''}
            ${r.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${r.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('sales-return-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      invoiceId: Number(form.invoiceId.value),
      reason: form.reason.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/sales-returns', 'POST', payload), 'تم حفظ المرتجع');
    await renderSalesReturns();
  });

  view.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/sales-returns/${btn.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد المرتجع');
      await renderSalesReturns();
    });
  });
  view.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/sales-returns/${btn.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف المرتجع');
      await renderSalesReturns();
    });
  });
}

async function renderPurchaseOrders() {
  setTitle('طلبات الشراء');
  setPageActions({});
  const view = document.getElementById('view');
  const [ordersRes, suppliersRes] = await Promise.all([api('/purchase-orders'), api('/suppliers')]);
  const rows = extractRows(ordersRes);
  const suppliers = extractRows(suppliersRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء طلب شراء</h3>
      <form id="po-form" class="grid cols-2">
        <div><label>المورد</label>
          <select name="supplierId" required>
            <option value="">اختر المورد</option>
            ${suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.code)} - ${escapeHtml(s.nameAr)}</option>`).join('')}
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
        rows.map((r) => [
          r.number,
          r.supplierId || '-',
          formatDate(r.date),
          formatMoney(r.total || 0),
          statusBadge(r.status),
          `<div class="actions">
            ${r.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-approve="${r.id}">اعتماد</button>` : ''}
            ${r.status === 'APPROVED' ? `<button class="btn btn-secondary btn-sm" data-send="${r.id}">إرسال</button>` : ''}
            ${r.status === 'SENT' ? `<button class="btn btn-success btn-sm" data-convert="${r.id}">تحويل</button>` : ''}
            ${r.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${r.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('po-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      supplierId: Number(form.supplierId.value),
      expectedDate: form.expectedDate.value || undefined,
      notes: form.notes.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/purchase-orders', 'POST', payload), 'تم حفظ طلب الشراء');
    await renderPurchaseOrders();
  });

  const wireAction = (attr, endpoint, message) => {
    view.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      btn.addEventListener('click', async () => {
        await withToast(() => api(`/purchase-orders/${btn.getAttribute(`data-${attr}`)}${endpoint}`, 'POST'), message);
        await renderPurchaseOrders();
      });
    });
  };
  wireAction('approve', '/approve', 'تم اعتماد الطلب');
  wireAction('send', '/send', 'تم إرسال الطلب');
  wireAction('convert', '/convert', 'تم تحويل الطلب إلى فاتورة');
  view.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-orders/${btn.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف الطلب');
      await renderPurchaseOrders();
    });
  });
}

async function renderPurchaseReturns() {
  setTitle('مرتجعات المشتريات');
  setPageActions({});
  const view = document.getElementById('view');
  const [returnsRes, invoicesRes] = await Promise.all([
    api('/purchase-returns'),
    api('/invoices?type=PURCHASE&status=ISSUED&page=1&limit=200')
  ]);
  const rows = extractRows(returnsRes);
  const invoices = extractRows(invoicesRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء مرتجع مشتريات</h3>
      <form id="pr-form" class="grid cols-2">
        <div><label>فاتورة الشراء</label>
          <select name="invoiceId" required>
            <option value="">اختر الفاتورة</option>
            ${invoices.map((inv) => `<option value="${inv.id}">${escapeHtml(inv.number)} - ${escapeHtml(inv.supplier?.nameAr || '')}</option>`).join('')}
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
        rows.map((r) => [
          r.number,
          r.invoiceId || '-',
          formatDate(r.date),
          formatMoney(r.total || 0),
          statusBadge(r.status),
          `<div class="actions">
            ${r.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-approve="${r.id}">اعتماد</button>` : ''}
            ${r.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-delete="${r.id}">حذف</button>` : ''}
          </div>`
        ])
      )}
    </div>
  `;

  document.getElementById('pr-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      invoiceId: Number(form.invoiceId.value),
      reason: form.reason.value || undefined,
      lines: parseLineRows(form)
    };
    await withToast(() => api('/purchase-returns', 'POST', payload), 'تم حفظ مرتجع المشتريات');
    await renderPurchaseReturns();
  });

  view.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-returns/${btn.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد المرتجع');
      await renderPurchaseReturns();
    });
  });
  view.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/purchase-returns/${btn.getAttribute('data-delete')}`, 'DELETE'), 'تم حذف المرتجع');
      await renderPurchaseReturns();
    });
  });
}

async function renderSimpleCrud(path, title, fields) {
  setTitle(title);
  setPageActions({});
  const view = document.getElementById('view');
  const rows = extractRows(await api(path));
  const headers = fields.map((f) => f.label).concat(['إجراءات']);
  const tableRows = rows.map((row) =>
    fields
      .map((f) => row[f.key] ?? '-')
      .concat(`<button class="btn btn-danger btn-sm" data-delete="${row.id}">حذف</button>`)
  );

  view.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <form id="simple-form" class="grid cols-2">
        ${fields
          .map(
            (f) =>
              `<div><label>${f.label}</label><input name="${f.key}" ${f.type ? `type="${f.type}"` : ''} ${f.required ? 'required' : ''} ${
                f.defaultValue !== undefined ? `value="${escapeHtml(f.defaultValue)}"` : ''
              } /></div>`
          )
          .join('')}
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ</button></div>
      </form>
    </div>
    <div class="card">
      ${table(headers, tableRows)}
    </div>
  `;

  document.getElementById('simple-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {};
    fields.forEach((f) => {
      const raw = form[f.key].value;
      if (f.type === 'number') payload[f.key] = Number(raw || 0);
      else if (f.type === 'checkbox') payload[f.key] = Boolean(raw);
      else payload[f.key] = raw;
    });
    await withToast(() => api(path, 'POST', payload), 'تم الحفظ');
    await renderSimpleCrud(path, title, fields);
  });

  view.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`${path}/${btn.getAttribute('data-delete')}`, 'DELETE'), 'تم الحذف');
      await renderSimpleCrud(path, title, fields);
    });
  });
}

async function renderStockCounts() {
  setTitle('جرد المخزون');
  setPageActions({});
  const view = document.getElementById('view');
  const [countsRes, warehousesRes, itemsRes] = await Promise.all([api('/stock-counts'), api('/warehouses'), api('/items')]);
  const counts = extractRows(countsRes);
  const warehouses = extractRows(warehousesRes);
  const items = extractRows(itemsRes);

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء جرد</h3>
      <form id="count-form" class="grid cols-2">
        <div><label>رقم الجرد</label><input name="number" required value="SC-${Date.now()}" /></div>
        <div><label>المستودع</label>
          <select name="warehouseId" required>
            <option value="">اختر المستودع</option>
            ${warehouses.map((w) => `<option value="${w.id}">${escapeHtml(w.code)} - ${escapeHtml(w.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>التاريخ</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>ملاحظات</label><input name="notes" /></div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ الجرد</button></div>
      </form>
    </div>
    <div class="card">
      <h3>إضافة بنود جرد</h3>
      <form id="count-line-form" class="grid cols-2">
        <div><label>الجرد</label>
          <select name="stockCountId" required>
            <option value="">اختر الجرد</option>
            ${counts.map((c) => `<option value="${c.id}">${escapeHtml(c.number)}</option>`).join('')}
          </select>
        </div>
        <div><label>الصنف</label>
          <select name="itemId" required>
            <option value="">اختر الصنف</option>
            ${items.map((i) => `<option value="${i.id}">${escapeHtml(i.code)} - ${escapeHtml(i.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>الكمية النظرية</label><input name="theoreticalQty" type="number" step="0.01" value="0" /></div>
        <div><label>الكمية الفعلية</label><input name="actualQty" type="number" step="0.01" value="0" /></div>
        <div><label>تكلفة الوحدة</label><input name="unitCost" type="number" step="0.01" value="0" /></div>
        <div style="grid-column:1/-1;"><button class="btn btn-secondary" type="submit">إضافة بند</button></div>
      </form>
    </div>
    <div class="card">
      ${table(
        ['رقم الجرد', 'المستودع', 'التاريخ', 'الحالة', 'إجراءات'],
        counts.map((c) => [
          c.number,
          c.warehouseId,
          formatDate(c.date),
          statusBadge(c.status),
          c.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-approve="${c.id}">اعتماد</button>` : '-'
        ])
      )}
    </div>
  `;

  document.getElementById('count-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      number: form.number.value,
      warehouseId: Number(form.warehouseId.value),
      date: new Date(form.date.value).toISOString(),
      status: 'DRAFT',
      notes: form.notes.value || undefined
    };
    await withToast(() => api('/stock-counts', 'POST', payload), 'تم إنشاء الجرد');
    await renderStockCounts();
  });

  document.getElementById('count-line-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      stockCountId: Number(form.stockCountId.value),
      itemId: Number(form.itemId.value),
      theoreticalQty: Number(form.theoreticalQty.value || 0),
      actualQty: Number(form.actualQty.value || 0),
      differenceQty: Number(form.actualQty.value || 0) - Number(form.theoreticalQty.value || 0),
      unitCost: Number(form.unitCost.value || 0),
      differenceValue: (Number(form.actualQty.value || 0) - Number(form.theoreticalQty.value || 0)) * Number(form.unitCost.value || 0)
    };
    await withToast(() => api('/stock-count-lines', 'POST', payload), 'تمت إضافة بند الجرد');
    await renderStockCounts();
  });

  view.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await withToast(() => api(`/stock-counts/${btn.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد الجرد');
      await renderStockCounts();
    });
  });
}

async function renderSalesReports() {
  setTitle('تقارير المبيعات');
  setPageActions({});
  const view = document.getElementById('view');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const res = await api(`/reports/sales${toQuery({ dateFrom: from, dateTo: today })}`);
  const payload = extractData(res) || {};
  const summary = payload.summary || {};
  const rows = payload.rows || [];

  view.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
      <div class="kpi"><div>الإجمالي</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
      <div class="kpi"><div>المسدّد</div><div class="val">${formatMoney(summary.paid || 0)}</div></div>
      <div class="kpi"><div>المتبقي</div><div class="val">${formatMoney(summary.outstanding || 0)}</div></div>
    </div>
    <div class="card">
      ${table(
        ['رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
        rows.map((r) => [r.number, r.customer?.nameAr || '-', formatDate(r.date), formatMoney(r.total), formatMoney(r.outstanding), statusBadge(r.status)])
      )}
      <button id="sales-export" class="btn btn-secondary">تصدير CSV</button>
    </div>
  `;

  document.getElementById('sales-export')?.addEventListener('click', () => {
    downloadCsv(
      'sales-report.csv',
      ['Invoice', 'Customer', 'Date', 'Total', 'Outstanding', 'Status'],
      rows.map((r) => [r.number, r.customer?.nameAr || '', formatDate(r.date), r.total, r.outstanding, r.status])
    );
  });
}

async function renderPurchaseReports() {
  setTitle('تقارير المشتريات');
  setPageActions({});
  const view = document.getElementById('view');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const res = await api(`/reports/purchases${toQuery({ dateFrom: from, dateTo: today })}`);
  const payload = extractData(res) || {};
  const summary = payload.summary || {};
  const rows = payload.rows || [];

  view.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
      <div class="kpi"><div>إجمالي المشتريات</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
      <div class="kpi"><div>مرتجعات</div><div class="val">${formatMoney(summary.purchaseReturnsTotal || 0)}</div></div>
      <div class="kpi"><div>صافي المشتريات</div><div class="val">${formatMoney(summary.netPurchases || 0)}</div></div>
    </div>
    <div class="card">
      ${table(
        ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
        rows.map((r) => [r.number, r.supplier?.nameAr || '-', formatDate(r.date), formatMoney(r.total), formatMoney(r.outstanding), statusBadge(r.status)])
      )}
      <button id="purchase-export" class="btn btn-secondary">تصدير CSV</button>
    </div>
  `;

  document.getElementById('purchase-export')?.addEventListener('click', () => {
    downloadCsv(
      'purchase-report.csv',
      ['Invoice', 'Supplier', 'Date', 'Total', 'Outstanding', 'Status'],
      rows.map((r) => [r.number, r.supplier?.nameAr || '', formatDate(r.date), r.total, r.outstanding, r.status])
    );
  });
}

async function renderInventoryReports() {
  setTitle('تقارير المخزون');
  setPageActions({});
  const view = document.getElementById('view');
  const res = await api('/reports/inventory');
  const payload = extractData(res) || {};
  const summary = payload.summary || {};
  const rows = payload.rows || [];

  view.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div>عدد الأصناف</div><div class="val">${summary.items || 0}</div></div>
      <div class="kpi"><div>إجمالي الكمية</div><div class="val">${summary.totalQty || 0}</div></div>
      <div class="kpi"><div>قيمة المخزون</div><div class="val">${formatMoney(summary.totalValue || 0)}</div></div>
      <div class="kpi"><div>أصناف تحت الحد</div><div class="val">${summary.belowReorder || 0}</div></div>
    </div>
    <div class="card">
      ${table(
        ['الكود', 'الصنف', 'الكمية', 'القيمة', 'حد إعادة الطلب'],
        rows.map((r) => [r.code, r.nameAr, Number(r.onHandQty || 0), formatMoney(r.inventoryValue || 0), Number(r.reorderPoint || 0)])
      )}
      <button id="inventory-export" class="btn btn-secondary">تصدير CSV</button>
    </div>
  `;

  document.getElementById('inventory-export')?.addEventListener('click', () => {
    downloadCsv(
      'inventory-report.csv',
      ['Code', 'Name', 'Qty', 'Value', 'ReorderPoint'],
      rows.map((r) => [r.code, r.nameAr, r.onHandQty, r.inventoryValue, r.reorderPoint])
    );
  });
}

async function renderSalesReportsPage() {
  setTitle('تقارير المبيعات');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/sales${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="sales-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="sales-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
        <div class="kpi"><div>الإجمالي</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
        <div class="kpi"><div>المسدد</div><div class="val">${formatMoney(summary.paid || 0)}</div></div>
        <div class="kpi"><div>المتبقي</div><div class="val">${formatMoney(summary.outstanding || 0)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
          rows.map((r) => [r.number, r.customer?.nameAr || '-', formatDate(r.date), formatMoney(r.total), formatMoney(r.outstanding), statusBadge(r.status)])
        )}
      </div>
    `;

    document.getElementById('sales-report-filter')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('sales-export')?.addEventListener('click', () => {
      downloadCsv(
        'sales-report.csv',
        ['Invoice', 'Customer', 'Date', 'Total', 'Outstanding', 'Status'],
        rows.map((r) => [r.number, r.customer?.nameAr || '', formatDate(r.date), r.total, r.outstanding, r.status])
      );
    });
  };

  await load();
}

async function renderPurchaseReportsPage() {
  setTitle('تقارير المشتريات');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/purchases${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="purchase-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="purchase-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
        <div class="kpi"><div>إجمالي المشتريات</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
        <div class="kpi"><div>مرتجعات</div><div class="val">${formatMoney(summary.purchaseReturnsTotal || 0)}</div></div>
        <div class="kpi"><div>صافي المشتريات</div><div class="val">${formatMoney(summary.netPurchases || 0)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
          rows.map((r) => [r.number, r.supplier?.nameAr || '-', formatDate(r.date), formatMoney(r.total), formatMoney(r.outstanding), statusBadge(r.status)])
        )}
      </div>
    `;

    document.getElementById('purchase-report-filter')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('purchase-export')?.addEventListener('click', () => {
      downloadCsv(
        'purchase-report.csv',
        ['Invoice', 'Supplier', 'Date', 'Total', 'Outstanding', 'Status'],
        rows.map((r) => [r.number, r.supplier?.nameAr || '', formatDate(r.date), r.total, r.outstanding, r.status])
      );
    });
  };

  await load();
}

async function renderInventoryReportsPage() {
  setTitle('تقارير المخزون');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/inventory${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="inventory-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="inventory-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الأصناف</div><div class="val">${summary.items || 0}</div></div>
        <div class="kpi"><div>إجمالي الكمية</div><div class="val">${summary.totalQty || 0}</div></div>
        <div class="kpi"><div>قيمة المخزون</div><div class="val">${formatMoney(summary.totalValue || 0)}</div></div>
        <div class="kpi"><div>أصناف تحت الحد</div><div class="val">${summary.belowReorder || 0}</div></div>
      </div>
      <div class="card">
        ${table(
          ['الكود', 'الصنف', 'الكمية', 'القيمة', 'حد إعادة الطلب'],
          rows.map((r) => [r.code, r.nameAr, Number(r.onHandQty || 0), formatMoney(r.inventoryValue || 0), Number(r.reorderPoint || 0)])
        )}
      </div>
    `;

    document.getElementById('inventory-report-filter')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('inventory-export')?.addEventListener('click', () => {
      downloadCsv(
        'inventory-report.csv',
        ['Code', 'Name', 'Qty', 'Value', 'ReorderPoint'],
        rows.map((r) => [r.code, r.nameAr, r.onHandQty, r.inventoryValue, r.reorderPoint])
      );
    });
  };

  await load();
}

async function renderStockMovementsPage() {
  setTitle('حركات المخزون');
  setPageActions({});
  const view = document.getElementById('view');
  const rows = extractRows(await api('/stock-movements?page=1&limit=500'));
  view.innerHTML = `
    <div class="card">
      ${table(
        ['النوع', 'المرجع', 'التاريخ', 'الصنف', 'المستودع', 'الكمية', 'تكلفة الوحدة', 'إجمالي التكلفة'],
        rows.map((r) => [
          r.type || '-',
          r.reference || '-',
          formatDate(r.date),
          r.itemId ?? '-',
          r.warehouseId ?? '-',
          Number(r.quantity || 0),
          formatMoney(r.unitCost || 0),
          formatMoney(r.totalCost || 0)
        ])
      )}
    </div>
  `;
}

export async function renderSection(path) {
  try {
    switch (path) {
      case '/sales-quotes':
        await renderSalesQuotes();
        break;
      case '/sales-returns':
        await renderSalesReturns();
        break;
      case '/purchase-orders':
        await renderPurchaseOrders();
        break;
      case '/purchase-returns':
        await renderPurchaseReturns();
        break;
      case '/items':
        await renderSimpleCrud('/items', 'الأصناف', [
          { key: 'code', label: 'الكود', required: true },
          { key: 'nameAr', label: 'الاسم', required: true },
          { key: 'salePrice', label: 'سعر البيع', type: 'number', defaultValue: 0 },
          { key: 'purchasePrice', label: 'سعر الشراء', type: 'number', defaultValue: 0 },
          { key: 'reorderPoint', label: 'حد إعادة الطلب', type: 'number', defaultValue: 0 },
          { key: 'minStock', label: 'حد أدنى', type: 'number', defaultValue: 0 },
          { key: 'maxStock', label: 'حد أقصى', type: 'number', defaultValue: 0 },
          { key: 'onHandQty', label: 'كمية حالية', type: 'number', defaultValue: 0 },
          { key: 'inventoryValue', label: 'قيمة المخزون', type: 'number', defaultValue: 0 },
          { key: 'isActive', label: 'نشط', defaultValue: true }
        ]);
        break;
      case '/item-categories':
        await renderSimpleCrud('/item-categories', 'تصنيفات الأصناف', [
          { key: 'code', label: 'الكود', required: true },
          { key: 'nameAr', label: 'الاسم', required: true },
          { key: 'isActive', label: 'نشط', defaultValue: true }
        ]);
        break;
      case '/units':
        await renderSimpleCrud('/units', 'الوحدات', [
          { key: 'code', label: 'الكود', required: true },
          { key: 'nameAr', label: 'الاسم', required: true },
          { key: 'isActive', label: 'نشط', defaultValue: true }
        ]);
        break;
      case '/warehouses':
        await renderSimpleCrud('/warehouses', 'المستودعات', [
          { key: 'code', label: 'الكود', required: true },
          { key: 'nameAr', label: 'الاسم', required: true },
          { key: 'location', label: 'الموقع' },
          { key: 'manager', label: 'المسؤول' },
          { key: 'isActive', label: 'نشط', defaultValue: true }
        ]);
        break;
      case '/stock-counts':
        await renderStockCounts();
        break;
      case '/stock-movements':
        await renderStockMovementsPage();
        break;
      case '/sales-reports':
        await renderSalesReportsPage();
        break;
      case '/purchase-reports':
        await renderPurchaseReportsPage();
        break;
      case '/inventory-reports':
        await renderInventoryReportsPage();
        break;
      default:
        await renderModuleShell({ title: titles[path] ?? 'وحدة' });
        break;
    }
  } catch (error) {
    toast(error.message || 'حدث خطأ أثناء تحميل الصفحة', 'error');
  }
}
