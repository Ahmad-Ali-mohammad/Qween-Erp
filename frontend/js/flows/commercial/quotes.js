import { request, withToast, extractRows } from '../../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table, toast } from '../../core/ui.js';
import {
  bindLineEditor,
  bindLookupField,
  buildEntityLabel,
  calculateDocumentTotals,
  formatIsoDate,
  renderLookupField
} from './document-workspace.js';

function emptyLine() {
  return { description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 };
}

export async function renderQuotes() {
  setTitle('عروض الأسعار');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مساحة العروض...</div>';

  const state = {
    editingId: null,
    selectedCustomerId: '',
    search: '',
    status: '',
    validUntil: '',
    notes: '',
    lines: [emptyLine()]
  };

  const load = async () => {
    const [quotesRes, customersRes] = await Promise.all([request('/quotes?page=1&limit=100'), request('/customers?page=1&limit=500')]);
    const quotes = extractRows(quotesRes);
    const customers = extractRows(customersRes);
    const customerMap = new Map(customers.map((customer) => [String(customer.id), customer]));

    const filteredQuotes = quotes.filter((quote) => {
      const customer = customerMap.get(String(quote.customerId));
      const haystack = [quote.number, quote.notes, buildEntityLabel(customer)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = state.search ? haystack.includes(state.search.toLowerCase()) : true;
      const matchesStatus = state.status ? quote.status === state.status : true;
      return matchesSearch && matchesStatus;
    });

    const stats = quotes.reduce(
      (acc, quote) => {
        acc.total += 1;
        acc[quote.status] = (acc[quote.status] || 0) + 1;
        return acc;
      },
      { total: 0, DRAFT: 0, SENT: 0, ACCEPTED: 0, REJECTED: 0, CONVERTED: 0 }
    );

    view.innerHTML = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">من الفرصة إلى الفاتورة</p>
          <h3>${state.editingId ? 'تحديث عرض سعر قائم' : 'إعداد عرض سعر جديد'}</h3>
          <p class="muted">استخدم البحث السريع للعميل، راجع البنود، ثم أرسل العرض أو حوّله إلى فاتورة عند الاعتماد.</p>
        </div>
        <div class="workflow-kpis">
          <div class="kpi"><div>كل العروض</div><div class="val">${stats.total}</div></div>
          <div class="kpi"><div>مسودات</div><div class="val">${stats.DRAFT}</div></div>
          <div class="kpi"><div>مرسلة / مقبولة</div><div class="val">${stats.SENT + stats.ACCEPTED}</div></div>
        </div>
      </section>

      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>${state.editingId ? 'تحرير العرض' : 'بطاقة العرض'}</h3>
            <div class="actions">
              <button id="quote-new" class="btn btn-secondary" type="button">مسودة جديدة</button>
              <button id="quote-add-line" class="btn btn-primary" type="button">إضافة بند</button>
            </div>
          </div>

          <form id="quote-form" class="grid-3">
            ${renderLookupField({
              inputId: 'quote-customer-input',
              hiddenId: 'quote-customer-id',
              listId: 'quote-customer-list',
              label: 'العميل',
              placeholder: 'ابحث بالرمز أو الاسم',
              entities: customers,
              selectedId: state.selectedCustomerId
            })}
            <div><label>التاريخ</label><input id="quote-date" type="date" value="${formatIsoDate()}" disabled /></div>
            <div><label>صالح حتى</label><input id="quote-valid-until" type="date" value="${state.validUntil}" /></div>
            <div style="grid-column:1 / -1;">
              <label>ملاحظات العرض</label>
              <textarea id="quote-notes" rows="3" placeholder="ملخص العرض أو الشروط التجارية">${state.notes}</textarea>
            </div>

            <div style="grid-column:1 / -1;">
              <div class="section-title">
                <h4>بنود العرض</h4>
                <span class="muted">الأسعار والخصومات والضريبة تحسب مباشرة</span>
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
                  <tbody id="quote-lines"></tbody>
                </table>
              </div>
            </div>

            <div class="workflow-summary-panel" style="grid-column:1 / -1;">
              <div class="kpi"><div>قبل الضريبة</div><div id="quote-subtotal" class="val">0.00</div></div>
              <div class="kpi"><div>الضريبة</div><div id="quote-tax" class="val">0.00</div></div>
              <div class="kpi"><div>الإجمالي النهائي</div><div id="quote-total" class="val">0.00</div></div>
            </div>

            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">${state.editingId ? 'تحديث المسودة' : 'حفظ كمسودة'}</button>
            </div>
          </form>
        </article>

        <aside class="card workflow-side">
          <h3>قائمة المتابعة</h3>
          <p class="muted">فلترة سريعة حسب الحالة أو البحث بالنص.</p>
          <div class="grid-2">
            <div><label>بحث</label><input id="quote-search" value="${state.search}" placeholder="رقم، عميل، ملاحظات" /></div>
            <div>
              <label>الحالة</label>
              <select id="quote-status">
                <option value="">كل الحالات</option>
                <option value="DRAFT" ${state.status === 'DRAFT' ? 'selected' : ''}>مسودة</option>
                <option value="SENT" ${state.status === 'SENT' ? 'selected' : ''}>مرسل</option>
                <option value="ACCEPTED" ${state.status === 'ACCEPTED' ? 'selected' : ''}>مقبول</option>
                <option value="REJECTED" ${state.status === 'REJECTED' ? 'selected' : ''}>مرفوض</option>
                <option value="CONVERTED" ${state.status === 'CONVERTED' ? 'selected' : ''}>محوّل</option>
              </select>
            </div>
          </div>
          <div class="actions" style="margin-top:10px;">
            <button id="quote-search-btn" class="btn btn-info btn-sm" type="button">تطبيق</button>
            <button id="quote-reset-filters" class="btn btn-secondary btn-sm" type="button">إعادة ضبط</button>
          </div>
        </aside>
      </section>

      <section class="card">
        <div class="section-title">
          <h3>Pipeline العروض</h3>
          <span class="muted">${filteredQuotes.length} عنصر مطابق</span>
        </div>
        ${table(
          ['الرقم', 'العميل', 'التاريخ', 'صالح حتى', 'الإجمالي', 'الحالة', 'الإجراءات'],
          filteredQuotes.map((quote) => {
            const customer = customerMap.get(String(quote.customerId));
            return [
              quote.number,
              customer ? buildEntityLabel(customer) : quote.customer?.nameAr || `عميل #${quote.customerId || '-'}`,
              formatDate(quote.date),
              formatDate(quote.validUntil),
              formatMoney(quote.total || 0),
              statusBadge(quote.status),
              `<div class="actions">
                ${quote.status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" data-action="edit" data-id="${quote.id}">تعديل</button>` : ''}
                ${quote.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="send" data-id="${quote.id}">إرسال</button>` : ''}
                ${quote.status === 'SENT' ? `<button class="btn btn-success btn-sm" data-action="accept" data-id="${quote.id}">قبول</button>` : ''}
                ${quote.status === 'SENT' ? `<button class="btn btn-danger btn-sm" data-action="reject" data-id="${quote.id}">رفض</button>` : ''}
                ${['SENT', 'ACCEPTED'].includes(quote.status) ? `<button class="btn btn-success btn-sm" data-action="convert" data-id="${quote.id}">تحويل إلى فاتورة</button>` : ''}
                ${quote.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${quote.id}">حذف</button>` : ''}
              </div>`
            ];
          })
        )}
      </section>
    `;

    const customerField = bindLookupField({
      inputId: 'quote-customer-input',
      hiddenId: 'quote-customer-id',
      entities: customers,
      onResolved(match) {
        state.selectedCustomerId = match ? String(match.id) : '';
      }
    });

    const lineEditor = bindLineEditor({
      container: document.getElementById('quote-lines'),
      state,
      prefix: 'quote',
      onChange(totals) {
        document.getElementById('quote-subtotal').textContent = totals.subtotal.toFixed(2);
        document.getElementById('quote-tax').textContent = totals.taxAmount.toFixed(2);
        document.getElementById('quote-total').textContent = totals.total.toFixed(2);
      }
    });

    document.getElementById('quote-add-line').addEventListener('click', () => lineEditor.addLine(emptyLine()));

    document.getElementById('quote-new').addEventListener('click', async () => {
      state.editingId = null;
      state.selectedCustomerId = '';
      state.validUntil = '';
      state.notes = '';
      state.lines = [emptyLine()];
      await load();
    });

    document.getElementById('quote-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const resolvedCustomer = customerField.resolve();
      const payload = {
        customerId: Number(document.getElementById('quote-customer-id').value || 0),
        validUntil: document.getElementById('quote-valid-until').value || undefined,
        notes: document.getElementById('quote-notes').value.trim() || undefined,
        lines: state.lines.filter((line) => line.description && line.quantity > 0)
      };

      if (!resolvedCustomer || !payload.customerId) {
        toast('اختر عميلًا من القائمة المقترحة قبل الحفظ', 'warning');
        return;
      }

      if (!payload.lines.length) {
        toast('أضف بندًا واحدًا على الأقل قبل الحفظ', 'warning');
        return;
      }

      if (state.editingId) {
        await withToast(() => request(`/quotes/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث عرض السعر');
      } else {
        await withToast(() => request('/quotes', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء عرض السعر');
      }

      state.editingId = null;
      state.selectedCustomerId = '';
      state.validUntil = '';
      state.notes = '';
      state.lines = [emptyLine()];
      await load();
    });

    document.getElementById('quote-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('quote-search').value.trim();
      state.status = document.getElementById('quote-status').value;
      await load();
    });

    document.getElementById('quote-reset-filters').addEventListener('click', async () => {
      state.search = '';
      state.status = '';
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');

        if (action === 'edit') {
          const details = await request(`/quotes/${id}`);
          const quote = details.data;
          state.editingId = quote.id;
          state.selectedCustomerId = String(quote.customerId || '');
          state.validUntil = quote.validUntil ? String(quote.validUntil).slice(0, 10) : '';
          state.notes = quote.notes || '';
          state.lines = Array.isArray(quote.lines) && quote.lines.length ? quote.lines : [emptyLine()];
          await load();
          return;
        }

        if (action === 'send') {
          await withToast(() => request(`/quotes/${id}/send`, { method: 'POST' }), 'تم إرسال عرض السعر');
        }

        if (action === 'accept') {
          await withToast(
            () => request(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ACCEPTED' }) }),
            'تم اعتماد العرض'
          );
        }

        if (action === 'reject') {
          await withToast(
            () => request(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED' }) }),
            'تم رفض العرض'
          );
        }

        if (action === 'convert') {
          const result = await withToast(() => request(`/quotes/${id}/convert`, { method: 'POST' }), 'تم تحويل العرض إلى فاتورة');
          if (result?.data?.invoiceId) {
            toast(`تم إنشاء الفاتورة ${result.data.invoiceNumber || ''}`.trim(), 'success');
          }
        }

        if (action === 'delete') {
          await withToast(() => request(`/quotes/${id}`, { method: 'DELETE' }), 'تم حذف عرض السعر');
        }

        await load();
      });
    });

    setPageActions({
      onNew: () => document.getElementById('quote-new').click(),
      onSave: () => document.getElementById('quote-form').requestSubmit(),
      onSearch: () => document.getElementById('quote-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
