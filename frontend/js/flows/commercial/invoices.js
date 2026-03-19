import { request, withToast, toQuery, extractRows } from '../../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, confirmAction, toast, setPageActions } from '../../core/ui.js';
import { bindLineEditor, bindLookupField, buildEntityLabel, formatIsoDate, renderLookupField } from './document-workspace.js';

function emptyLine() {
  return { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 };
}

export async function renderInvoices(mode = 'SALES') {
  const isSales = mode === 'SALES';
  setTitle(isSales ? 'فواتير المبيعات' : 'فواتير الشراء');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مركز الفواتير...</div>';

  const state = {
    editingId: null,
    selectedPartyId: '',
    search: '',
    status: '',
    invoiceDate: formatIsoDate(),
    dueDate: formatIsoDate(30),
    notes: '',
    lines: [emptyLine()]
  };

  const resetEditor = () => {
    state.editingId = null;
    state.selectedPartyId = '';
    state.invoiceDate = formatIsoDate();
    state.dueDate = formatIsoDate(30);
    state.notes = '';
    state.lines = [emptyLine()];
  };

  const load = async () => {
    const [invRes, partiesRes] = await Promise.all([
      request(`/invoices${toQuery({ page: 1, limit: 100, type: mode })}`),
      request(isSales ? '/customers?page=1&limit=500' : '/suppliers?page=1&limit=500')
    ]);

    const invoices = extractRows(invRes).filter((invoice) => invoice.type === mode);
    const parties = extractRows(partiesRes);

    const filteredInvoices = invoices.filter((invoice) => {
      const partyName = invoice.customer?.nameAr || invoice.supplier?.nameAr || '';
      const haystack = [invoice.number, invoice.status, invoice.notes, partyName].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = state.search ? haystack.includes(state.search.toLowerCase()) : true;
      const matchesStatus = state.status ? invoice.status === state.status : true;
      return matchesSearch && matchesStatus;
    });

    const stats = invoices.reduce(
      (acc, invoice) => {
        acc.total += Number(invoice.total || 0);
        acc.outstanding += Number(invoice.outstanding || 0);
        acc.count += 1;
        return acc;
      },
      { total: 0, outstanding: 0, count: 0 }
    );

    view.innerHTML = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">${isSales ? 'الإصدار والتحصيل' : 'الاستحقاق والسداد'}</p>
          <h3>${state.editingId ? 'تحرير فاتورة مسودة' : isSales ? 'إعداد فاتورة مبيعات' : 'إعداد فاتورة مشتريات'}</h3>
          <p class="muted">المسودة تبقى قابلة للمراجعة، أما الإصدار فينشئ أثرها المالي ويقفلها عن التعديل.</p>
        </div>
        <div class="workflow-kpis">
          <div class="kpi"><div>عدد الفواتير</div><div class="val">${stats.count}</div></div>
          <div class="kpi"><div>إجمالي القيمة</div><div class="val">${formatMoney(stats.total)}</div></div>
          <div class="kpi"><div>المتبقي المفتوح</div><div class="val">${formatMoney(stats.outstanding)}</div></div>
        </div>
      </section>

      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>${state.editingId ? 'بيانات الفاتورة' : 'فاتورة جديدة'}</h3>
            <div class="actions">
              <button id="invoice-new" class="btn btn-secondary" type="button">مسودة جديدة</button>
              <button id="invoice-add-line" class="btn btn-primary" type="button">إضافة سطر</button>
            </div>
          </div>

          <form id="invoice-form" class="grid-3">
            ${renderLookupField({
              inputId: 'invoice-party-input',
              hiddenId: 'invoice-party-id',
              listId: 'invoice-party-list',
              label: isSales ? 'العميل' : 'المورد',
              placeholder: isSales ? 'ابحث باسم العميل أو رمزه' : 'ابحث باسم المورد أو رمزه',
              entities: parties,
              selectedId: state.selectedPartyId
            })}
            <div><label>تاريخ الفاتورة</label><input id="invoice-date" type="date" value="${state.invoiceDate}" required /></div>
            <div><label>تاريخ الاستحقاق</label><input id="invoice-due-date" type="date" value="${state.dueDate}" /></div>
            <div style="grid-column:1 / -1;">
              <label>ملاحظات</label>
              <textarea id="invoice-notes" rows="3" placeholder="ملاحظات إضافية أو شروط الفاتورة">${state.notes}</textarea>
            </div>

            <div style="grid-column:1 / -1;">
              <div class="section-title">
                <h4>خطوط الفاتورة</h4>
                <span class="muted">راجع الكميات والأسعار قبل الحفظ أو الإصدار</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الوصف</th>
                      <th>الكمية</th>
                      <th>السعر</th>
                      <th>الخصم</th>
                      <th>الضريبة %</th>
                      <th>الإجمالي</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody id="invoice-lines"></tbody>
                </table>
              </div>
            </div>

            <div class="workflow-summary-panel" style="grid-column:1 / -1;">
              <div class="kpi"><div>قبل الضريبة</div><div id="invoice-subtotal" class="val">0.00</div></div>
              <div class="kpi"><div>الضريبة</div><div id="invoice-tax" class="val">0.00</div></div>
              <div class="kpi"><div>الإجمالي النهائي</div><div id="invoice-total" class="val">0.00</div></div>
            </div>

            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">${state.editingId ? 'تحديث المسودة' : 'حفظ كمسودة'}</button>
              <button class="btn btn-success" type="button" id="invoice-save-issue">حفظ وإصدار</button>
            </div>
          </form>
        </article>

        <aside class="card workflow-side">
          <h3>قائمة المتابعة</h3>
          <div class="grid-2">
            <div><label>بحث</label><input id="invoice-search" placeholder="رقم، طرف، ملاحظات" value="${state.search}" /></div>
            <div>
              <label>الحالة</label>
              <select id="invoice-status">
                <option value="">كل الحالات</option>
                <option value="DRAFT" ${state.status === 'DRAFT' ? 'selected' : ''}>مسودة</option>
                <option value="ISSUED" ${state.status === 'ISSUED' ? 'selected' : ''}>صادرة</option>
                <option value="PARTIAL" ${state.status === 'PARTIAL' ? 'selected' : ''}>مدفوعة جزئياً</option>
                <option value="PAID" ${state.status === 'PAID' ? 'selected' : ''}>مدفوعة</option>
                <option value="CANCELLED" ${state.status === 'CANCELLED' ? 'selected' : ''}>ملغاة</option>
              </select>
            </div>
          </div>
          <div class="actions" style="margin-top:10px;">
            <button id="invoice-search-btn" class="btn btn-info btn-sm" type="button">تطبيق</button>
            <button id="invoice-reset-filters" class="btn btn-secondary btn-sm" type="button">إعادة ضبط</button>
          </div>
        </aside>
      </section>

      <section class="card">
        <div class="section-title">
          <h3>سجل الفواتير</h3>
          <span class="muted">${filteredInvoices.length} عنصر مطابق</span>
        </div>
        ${table(
          ['رقم الفاتورة', 'التاريخ', isSales ? 'العميل' : 'المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'الإجراءات'],
          filteredInvoices.map((invoice) => [
            invoice.number,
            formatDate(invoice.date),
            invoice.customer?.nameAr || invoice.supplier?.nameAr || '-',
            formatMoney(invoice.total),
            formatMoney(invoice.paidAmount),
            formatMoney(invoice.outstanding),
            statusBadge(invoice.status),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${invoice.id}">عرض</button>
              ${invoice.status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" data-action="edit" data-id="${invoice.id}">تعديل</button>` : ''}
              ${invoice.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="issue" data-id="${invoice.id}">إصدار</button>` : ''}
              ${['ISSUED', 'PARTIAL'].includes(invoice.status) ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${invoice.id}">إلغاء</button>` : ''}
              ${invoice.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${invoice.id}">حذف</button>` : ''}
            </div>`
          ])
        )}
      </section>
    `;

    const partyField = bindLookupField({
      inputId: 'invoice-party-input',
      hiddenId: 'invoice-party-id',
      entities: parties,
      onResolved(match) {
        state.selectedPartyId = match ? String(match.id) : '';
      }
    });

    const lineEditor = bindLineEditor({
      container: document.getElementById('invoice-lines'),
      state,
      prefix: 'invoice',
      onChange(totals) {
        document.getElementById('invoice-subtotal').textContent = totals.subtotal.toFixed(2);
        document.getElementById('invoice-tax').textContent = totals.taxAmount.toFixed(2);
        document.getElementById('invoice-total').textContent = totals.total.toFixed(2);
      }
    });

    const save = async (issueAfterSave = false) => {
      const match = partyField.resolve();
      const payload = {
        type: mode,
        date: document.getElementById('invoice-date').value,
        dueDate: document.getElementById('invoice-due-date').value || undefined,
        customerId: isSales ? Number(document.getElementById('invoice-party-id').value || 0) || undefined : undefined,
        supplierId: !isSales ? Number(document.getElementById('invoice-party-id').value || 0) || undefined : undefined,
        notes: document.getElementById('invoice-notes').value.trim() || undefined,
        lines: state.lines.filter((line) => line.description && line.quantity > 0)
      };

      if (!match) {
        toast(isSales ? 'اختر عميلًا صحيحًا قبل الحفظ' : 'اختر موردًا صحيحًا قبل الحفظ', 'warning');
        return;
      }

      if (!payload.lines.length) {
        toast('أضف سطرًا واحدًا على الأقل في الفاتورة', 'warning');
        return;
      }

      if (state.editingId) {
        await withToast(() => request(`/invoices/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث الفاتورة');
        if (issueAfterSave) {
          await withToast(() => request(`/invoices/${state.editingId}/issue`, { method: 'POST' }), 'تم إصدار الفاتورة');
        }
      } else {
        const created = await withToast(() => request('/invoices', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الفاتورة');
        if (issueAfterSave) {
          await withToast(() => request(`/invoices/${created.data.id}/issue`, { method: 'POST' }), 'تم إصدار الفاتورة');
        }
      }

      resetEditor();
      await load();
    };

    document.getElementById('invoice-add-line').addEventListener('click', () => lineEditor.addLine(emptyLine()));
    document.getElementById('invoice-new').addEventListener('click', async () => {
      resetEditor();
      await load();
    });
    document.getElementById('invoice-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await save(false);
    });
    document.getElementById('invoice-save-issue').addEventListener('click', async () => save(true));
    document.getElementById('invoice-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('invoice-search').value.trim();
      state.status = document.getElementById('invoice-status').value;
      await load();
    });
    document.getElementById('invoice-reset-filters').addEventListener('click', async () => {
      state.search = '';
      state.status = '';
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');

        if (action === 'view') {
          const details = await request(`/invoices/${id}`);
          toast(`الفاتورة ${details.data.number} | الإجمالي ${formatMoney(details.data.total)}`, 'info');
          return;
        }

        if (action === 'edit') {
          const details = await request(`/invoices/${id}`);
          const invoice = details.data;
          state.editingId = invoice.id;
          state.selectedPartyId = String(invoice.customerId || invoice.supplierId || '');
          state.invoiceDate = String(invoice.date).slice(0, 10);
          state.dueDate = invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : '';
          state.notes = invoice.notes || '';
          state.lines = (invoice.lines || []).map((line) => ({
            description: line.description,
            quantity: Number(line.quantity || 0),
            unitPrice: Number(line.unitPrice || 0),
            discount: Number(line.discount || 0),
            taxRate: Number(line.taxRate || 15)
          }));
          await load();
          return;
        }

        if (action === 'issue') {
          await withToast(() => request(`/invoices/${id}/issue`, { method: 'POST' }), 'تم إصدار الفاتورة');
        }

        if (action === 'cancel') {
          const confirmed = await confirmAction('سيتم إلغاء الفاتورة وعكس أثرها المالي. هل تريد المتابعة؟', 'إلغاء فاتورة');
          if (!confirmed) return;
          await withToast(
            () => request(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled from UI' }) }),
            'تم إلغاء الفاتورة'
          );
        }

        if (action === 'delete') {
          const confirmed = await confirmAction('سيتم حذف الفاتورة المسودة نهائياً. هل تريد المتابعة؟');
          if (!confirmed) return;
          await withToast(() => request(`/invoices/${id}`, { method: 'DELETE' }), 'تم حذف الفاتورة');
        }

        await load();
      });
    });

    setPageActions({
      onNew: () => document.getElementById('invoice-new').click(),
      onSave: () => document.getElementById('invoice-form').requestSubmit(),
      onSearch: () => document.getElementById('invoice-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
