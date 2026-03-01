import { request, withToast, toQuery, extractRows } from '../core/api.js';
import {
  setTitle,
  table,
  formatMoney,
  formatDate,
  statusBadge,
  confirmAction,
  toast,
  setPageActions
} from '../core/ui.js';

function invoiceLineRow(index, line = {}) {
  return `
    <tr>
      <td><input class="inv-desc" value="${line.description || ''}" placeholder="وصف الصنف / الخدمة" /></td>
      <td><input class="inv-qty" type="number" min="0.01" step="0.01" value="${line.quantity || 1}" /></td>
      <td><input class="inv-price" type="number" min="0" step="0.01" value="${line.unitPrice || 0}" /></td>
      <td><input class="inv-discount" type="number" min="0" step="0.01" value="${line.discount || 0}" /></td>
      <td><input class="inv-tax" type="number" min="0" step="0.01" value="${line.taxRate || 15}" /></td>
      <td class="inv-total">0.00</td>
      <td><button class="btn btn-danger btn-sm" type="button" data-remove-line="${index}">حذف</button></td>
    </tr>
  `;
}

export async function renderInvoices(mode = 'SALES') {
  const isSales = mode === 'SALES';
  setTitle(isSales ? 'فواتير المبيعات' : 'فواتير الشراء');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الفواتير...</div>';

  const state = {
    editingId: null,
    lines: [{ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 }],
    search: ''
  };

  const load = async () => {
    const [invRes, partiesRes] = await Promise.all([
      request(`/invoices${toQuery({ page: 1, limit: 100, type: mode })}`),
      request(isSales ? '/customers' : '/suppliers')
    ]);

    const invoices = extractRows(invRes).filter((i) => i.type === mode);
    const parties = extractRows(partiesRes);
    const filtered = state.search
      ? invoices.filter((i) => [i.number, i.status, i.notes].filter(Boolean).join(' ').toLowerCase().includes(state.search.toLowerCase()))
      : invoices;

    view.innerHTML = `
      <div class="card">
        <div class="section-title">
          <h3>${state.editingId ? 'تعديل فاتورة' : 'فاتورة جديدة'} (${isSales ? 'مبيعات' : 'مشتريات'})</h3>
          <div class="actions">
            <button id="inv-new" class="btn btn-primary" type="button">فاتورة جديدة</button>
            <button id="inv-add-line" class="btn btn-secondary" type="button">إضافة سطر</button>
          </div>
        </div>

        <form id="invoice-form" class="grid-3">
          <div>
            <label>${isSales ? 'العميل' : 'المورد'}</label>
            <select id="inv-party" required>
              <option value="">اختر ${isSales ? 'العميل' : 'المورد'}</option>
              ${parties.map((p) => `<option value="${p.id}">${p.code} - ${p.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>تاريخ الفاتورة</label><input id="inv-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>تاريخ الاستحقاق</label><input id="inv-due" type="date" value="${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}" /></div>
          <div style="grid-column:1 / -1;"><label>ملاحظات</label><input id="inv-notes" placeholder="ملاحظات إضافية" /></div>

          <div style="grid-column:1 / -1;">
            <div class="table-wrap">
              <table>
                <thead><tr><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الضريبة %</th><th>الإجمالي</th><th>إجراء</th></tr></thead>
                <tbody id="inv-lines">${state.lines.map((line, idx) => invoiceLineRow(idx, line)).join('')}</tbody>
              </table>
            </div>
          </div>

          <div class="grid-3" style="grid-column:1 / -1;">
            <div class="kpi"><div>الإجمالي قبل الضريبة</div><div id="inv-subtotal" class="val">0.00</div></div>
            <div class="kpi"><div>الضريبة</div><div id="inv-vat" class="val">0.00</div></div>
            <div class="kpi"><div>الإجمالي النهائي</div><div id="inv-total" class="val">0.00</div></div>
          </div>

          <div class="actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">حفظ كمسودة</button>
            <button class="btn btn-success" type="button" id="inv-save-issue">حفظ وإصدار</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="toolbar">
          <h3>قائمة الفواتير</h3>
          <div class="actions">
            <input id="inv-search" placeholder="بحث" value="${state.search}" />
            <button id="inv-search-btn" class="btn btn-info btn-sm">بحث</button>
          </div>
        </div>
        ${table(
          ['رقم الفاتورة', 'التاريخ', isSales ? 'العميل' : 'المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'الإجراءات'],
          filtered.map((inv) => [
            inv.number,
            formatDate(inv.date),
            inv.customer?.nameAr || inv.supplier?.nameAr || '-',
            formatMoney(inv.total),
            formatMoney(inv.paidAmount),
            formatMoney(inv.outstanding),
            statusBadge(inv.status),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${inv.id}">عرض</button>
              ${inv.status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" data-action="edit" data-id="${inv.id}">تعديل</button>` : ''}
              ${inv.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="issue" data-id="${inv.id}">إصدار</button>` : ''}
              ${['ISSUED', 'PARTIAL'].includes(inv.status) ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${inv.id}">إلغاء</button>` : ''}
              ${inv.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">حذف</button>` : ''}
            </div>`
          ])
        )}
      </div>
    `;

    const linesBody = document.getElementById('inv-lines');

    const syncLines = () => {
      const rows = Array.from(linesBody.querySelectorAll('tr'));
      state.lines = rows.map((row) => ({
        description: row.querySelector('.inv-desc').value,
        quantity: Number(row.querySelector('.inv-qty').value || 0),
        unitPrice: Number(row.querySelector('.inv-price').value || 0),
        discount: Number(row.querySelector('.inv-discount').value || 0),
        taxRate: Number(row.querySelector('.inv-tax').value || 0)
      }));
    };

    const calcTotals = () => {
      syncLines();
      let subtotal = 0;
      let vat = 0;
      const rows = Array.from(linesBody.querySelectorAll('tr'));
      rows.forEach((row, idx) => {
        const line = state.lines[idx];
        const base = Math.max(0, line.quantity * line.unitPrice - line.discount);
        const taxAmount = base * (line.taxRate / 100);
        subtotal += base;
        vat += taxAmount;
        row.querySelector('.inv-total').textContent = (base + taxAmount).toFixed(2);
      });

      document.getElementById('inv-subtotal').textContent = subtotal.toFixed(2);
      document.getElementById('inv-vat').textContent = vat.toFixed(2);
      document.getElementById('inv-total').textContent = (subtotal + vat).toFixed(2);
    };

    const bindLineEvents = () => {
      linesBody.querySelectorAll('input').forEach((el) => {
        el.addEventListener('input', calcTotals);
      });

      linesBody.querySelectorAll('[data-remove-line]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-remove-line'));
          state.lines.splice(idx, 1);
          if (state.lines.length === 0) state.lines.push({ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 });
          linesBody.innerHTML = state.lines.map((line, index) => invoiceLineRow(index, line)).join('');
          bindLineEvents();
          calcTotals();
        });
      });
    };

    bindLineEvents();
    calcTotals();

    document.getElementById('inv-add-line').addEventListener('click', () => {
      syncLines();
      state.lines.push({ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 });
      linesBody.innerHTML = state.lines.map((line, index) => invoiceLineRow(index, line)).join('');
      bindLineEvents();
      calcTotals();
    });

    document.getElementById('inv-new').addEventListener('click', async () => {
      state.editingId = null;
      state.lines = [{ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 }];
      await load();
    });

    const save = async (issueAfterSave = false) => {
      syncLines();
      const payload = {
        type: mode,
        date: document.getElementById('inv-date').value,
        dueDate: document.getElementById('inv-due').value || undefined,
        customerId: isSales ? Number(document.getElementById('inv-party').value || 0) || undefined : undefined,
        supplierId: !isSales ? Number(document.getElementById('inv-party').value || 0) || undefined : undefined,
        notes: document.getElementById('inv-notes').value || undefined,
        lines: state.lines
          .filter((line) => line.description && line.quantity > 0)
          .map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            discount: Number(line.discount || 0),
            taxRate: Number(line.taxRate || 15)
          }))
      };

      if (!payload.lines.length) {
        toast('يجب إضافة سطر واحد على الأقل في الفاتورة', 'warning');
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

      state.editingId = null;
      state.lines = [{ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 }];
      await load();
    };

    document.getElementById('invoice-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await save(false);
    });

    document.getElementById('inv-save-issue').addEventListener('click', async () => {
      await save(true);
    });

    document.getElementById('inv-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('inv-search').value.trim();
      await load();
    });

    view.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const details = await request(`/invoices/${id}`);
        toast(`الفاتورة ${details.data.number} - الإجمالي ${formatMoney(details.data.total)}`, 'info');
      });
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const details = await request(`/invoices/${id}`);
        const inv = details.data;

        state.editingId = id;
        document.getElementById('inv-party').value = inv.customerId || inv.supplierId || '';
        document.getElementById('inv-date').value = inv.date.slice(0, 10);
        document.getElementById('inv-due').value = inv.dueDate ? inv.dueDate.slice(0, 10) : '';
        document.getElementById('inv-notes').value = inv.notes || '';
        state.lines = (inv.lines || []).map((l) => ({
          description: l.description,
          quantity: Number(l.quantity || 0),
          unitPrice: Number(l.unitPrice || 0),
          discount: Number(l.discount || 0),
          taxRate: Number(l.taxRate || 15)
        }));

        linesBody.innerHTML = state.lines.map((line, idx) => invoiceLineRow(idx, line)).join('');
        bindLineEvents();
        calcTotals();
      });
    });

    view.querySelectorAll('[data-action="issue"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/invoices/${id}/issue`, { method: 'POST' }), 'تم إصدار الفاتورة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم إلغاء الفاتورة وعكس أثرها المالي. هل تريد المتابعة؟', 'إلغاء فاتورة');
        if (!confirmed) return;
        await withToast(() => request(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled from UI' }) }), 'تم إلغاء الفاتورة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف الفاتورة المسودة نهائياً. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/invoices/${id}`, { method: 'DELETE' }), 'تم حذف الفاتورة');
        await load();
      });
    });

    setPageActions({
      onNew: () => document.getElementById('inv-new').click(),
      onSave: () => document.getElementById('invoice-form').requestSubmit(),
      onSearch: () => document.getElementById('inv-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
