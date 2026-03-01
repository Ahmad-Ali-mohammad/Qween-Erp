import { request, withToast, extractRows } from '../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, confirmAction, setPageActions } from '../core/ui.js';

const config = {
  customers: {
    title: 'العملاء',
    singular: 'عميل',
    endpoint: '/customers',
    codePrefix: 'CUS'
  },
  suppliers: {
    title: 'الموردين',
    singular: 'مورد',
    endpoint: '/suppliers',
    codePrefix: 'SUP'
  }
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyForm(prefix) {
  return {
    code: `${prefix}-${Date.now().toString().slice(-4)}`,
    nameAr: '',
    nameEn: '',
    taxNumber: '',
    phone: '',
    mobile: '',
    email: '',
    city: '',
    address: '',
    paymentTerms: 30,
    creditLimit: 0,
    bankName: '',
    bankAccount: '',
    iban: ''
  };
}

function detailsTabs(mode, selected, selectedInvoices, selectedPayments, selectedContacts) {
  if (!selected) return '<p class="muted">اختر سجلاً من القائمة لعرض التفاصيل.</p>';

  const invoicesTitle = mode === 'customers' ? 'فواتير المبيعات' : 'فواتير الشراء';
  const paymentsTitle = mode === 'customers' ? 'سندات القبض' : 'سندات الدفع';

  return `
    <div class="grid-2">
      <div><label>الاسم</label><div>${selected.nameAr || '-'}</div></div>
      <div><label>الرمز</label><div class="mono">${selected.code || '-'}</div></div>
      <div><label>الرصيد الحالي</label><div>${formatMoney(selected.currentBalance || 0)}</div></div>
      <div><label>الحالة</label><div>${statusBadge(selected.isActive ? 'ACTIVE' : 'CLOSED')}</div></div>
      <div><label>البريد الإلكتروني</label><div>${selected.email || '-'}</div></div>
      <div><label>الهاتف</label><div>${selected.phone || selected.mobile || '-'}</div></div>
      <div style="grid-column:1 / -1;"><label>العنوان</label><div>${selected.address || '-'}</div></div>
    </div>

    <h4 style="margin:14px 0 8px;">${invoicesTitle}</h4>
    ${table(
      ['رقم المستند', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
      asArray(selectedInvoices).slice(0, 10).map((row) => [
        row.number || '-',
        formatDate(row.date),
        formatMoney(row.total || 0),
        formatMoney(row.outstanding || 0),
        row.status || '-'
      ])
    )}

    <h4 style="margin:14px 0 8px;">${paymentsTitle}</h4>
    ${table(
      ['رقم السند', 'التاريخ', 'المبلغ', 'الحالة'],
      asArray(selectedPayments).slice(0, 10).map((row) => [row.number || '-', formatDate(row.date), formatMoney(row.amount || 0), row.status || '-'])
    )}

    <h4 style="margin:14px 0 8px;">جهات الاتصال</h4>
    ${table(
      ['الاسم', 'المنصب', 'الهاتف', 'البريد الإلكتروني'],
      asArray(selectedContacts).slice(0, 20).map((c) => [c.name || '-', c.position || '-', c.phone || c.mobile || '-', c.email || '-'])
    )}
  `;
}

export async function renderParties(mode = 'customers') {
  const m = config[mode] || config.customers;
  setTitle(m.title);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="card">جاري تحميل ${m.title}...</div>`;

  const state = {
    rows: [],
    query: '',
    selectedId: null,
    selected: null,
    selectedInvoices: [],
    selectedPayments: [],
    selectedContacts: [],
    editingId: null,
    form: emptyForm(m.codePrefix)
  };

  const load = async () => {
    const result = await request(m.endpoint);
    state.rows = asArray(extractRows(result));

    const filtered = state.query
      ? state.rows.filter((r) =>
          [r.code, r.nameAr, r.nameEn, r.taxNumber, r.email, r.mobile, r.phone]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(state.query.toLowerCase())
        )
      : state.rows;

    if (state.selectedId) {
      const [selectedRes, invoicesRes, paymentsRes, contactsRes] = await Promise.all([
        request(`${m.endpoint}/${state.selectedId}`).catch(() => ({ data: null })),
        request(`${m.endpoint}/${state.selectedId}/invoices`).catch(() => ({ data: [] })),
        request(`${m.endpoint}/${state.selectedId}/payments`).catch(() => ({ data: [] })),
        request(`${m.endpoint}/${state.selectedId}/contacts`).catch(() => ({ data: [] }))
      ]);
      state.selected = selectedRes.data || null;
      state.selectedInvoices = asArray(invoicesRes.data);
      state.selectedPayments = asArray(paymentsRes.data);
      state.selectedContacts = asArray(contactsRes.data);
    } else {
      state.selected = null;
      state.selectedInvoices = [];
      state.selectedPayments = [];
      state.selectedContacts = [];
    }

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>${m.title}</h3>
          <button id="party-new" class="btn btn-primary">+ ${m.singular} جديد</button>
        </div>
        <div class="search-row" style="margin-top:10px;">
          <input id="party-search" placeholder="بحث بالاسم أو الرمز أو الرقم الضريبي" value="${state.query}" />
          <button id="party-search-btn" class="btn btn-info">بحث</button>
          <button id="party-clear-btn" class="btn btn-secondary">مسح</button>
          <span class="muted" style="align-self:center;">${filtered.length} سجل</span>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>${state.editingId ? `تعديل ${m.singular}` : `إضافة ${m.singular}`}</h3>
          <form id="party-form" class="grid-2">
            <input id="party-id" type="hidden" value="${state.editingId || ''}" />
            <div><label>الرمز</label><input id="party-code" value="${state.form.code || ''}" required /></div>
            <div><label>الاسم العربي</label><input id="party-nameAr" value="${state.form.nameAr || ''}" required /></div>
            <div><label>الاسم الإنجليزي</label><input id="party-nameEn" value="${state.form.nameEn || ''}" /></div>
            <div><label>الرقم الضريبي</label><input id="party-tax" value="${state.form.taxNumber || ''}" /></div>
            <div><label>الهاتف</label><input id="party-phone" value="${state.form.phone || ''}" /></div>
            <div><label>الجوال</label><input id="party-mobile" value="${state.form.mobile || ''}" /></div>
            <div><label>البريد الإلكتروني</label><input id="party-email" type="email" value="${state.form.email || ''}" /></div>
            <div><label>المدينة</label><input id="party-city" value="${state.form.city || ''}" /></div>
            <div><label>الحد الائتماني</label><input id="party-credit" type="number" min="0" step="0.01" value="${state.form.creditLimit || 0}" /></div>
            <div><label>شروط السداد (يوم)</label><input id="party-terms" type="number" min="0" value="${state.form.paymentTerms || 30}" /></div>
            ${
              mode === 'suppliers'
                ? `
            <div><label>اسم البنك</label><input id="party-bankName" value="${state.form.bankName || ''}" /></div>
            <div><label>رقم الحساب البنكي</label><input id="party-bankAccount" value="${state.form.bankAccount || ''}" /></div>
            <div style="grid-column:1 / -1;"><label>رقم الآيبان</label><input id="party-iban" value="${state.form.iban || ''}" /></div>
            `
                : ''
            }
            <div style="grid-column:1 / -1;"><label>العنوان</label><textarea id="party-address" rows="2">${state.form.address || ''}</textarea></div>
            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">حفظ</button>
              <button class="btn btn-secondary" type="button" id="party-reset">إعادة تعيين</button>
            </div>
          </form>
        </div>

        <div class="card">
          <h3>تفاصيل ${m.singular}</h3>
          ${detailsTabs(mode, state.selected, state.selectedInvoices, state.selectedPayments, state.selectedContacts)}
          ${
            state.selectedId
              ? `
          <h4 style="margin:14px 0 8px;">إضافة جهة اتصال</h4>
          <form id="party-contact-form" class="grid-3">
            <div><label>الاسم</label><input id="party-contact-name" required /></div>
            <div><label>المنصب</label><input id="party-contact-position" /></div>
            <div><label>الهاتف</label><input id="party-contact-phone" /></div>
            <div><label>الجوال</label><input id="party-contact-mobile" /></div>
            <div><label>البريد الإلكتروني</label><input id="party-contact-email" type="email" /></div>
            <div><label>أساسي</label><select id="party-contact-primary"><option value="false">لا</option><option value="true">نعم</option></select></div>
            <div class="actions"><button class="btn btn-primary" type="submit">إضافة</button></div>
          </form>
          `
              : ''
          }
        </div>
      </div>

      <div class="card">
        <h3>قائمة ${m.title}</h3>
        ${table(
          ['الاسم', 'الرمز', 'الرقم الضريبي', 'الجوال/الهاتف', 'الرصيد', 'الحالة', 'الإجراءات'],
          filtered.map((row) => [
            row.nameAr || '-',
            row.code || '-',
            row.taxNumber || '-',
            row.mobile || row.phone || '-',
            formatMoney(row.currentBalance || 0),
            row.isActive ? statusBadge('ACTIVE') : statusBadge('CLOSED'),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="select" data-id="${row.id}">عرض</button>
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${row.id}">تعديل</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${row.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    const searchInput = document.getElementById('party-search');

    document.getElementById('party-search-btn').addEventListener('click', async () => {
      state.query = searchInput.value.trim();
      await load();
    });

    document.getElementById('party-clear-btn').addEventListener('click', async () => {
      state.query = '';
      await load();
    });

    document.getElementById('party-new').addEventListener('click', async () => {
      state.editingId = null;
      state.form = emptyForm(m.codePrefix);
      await load();
      document.getElementById('party-code').focus();
    });

    document.getElementById('party-reset').addEventListener('click', async () => {
      state.editingId = null;
      state.form = emptyForm(m.codePrefix);
      await load();
    });

    document.getElementById('party-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('party-code').value.trim(),
        nameAr: document.getElementById('party-nameAr').value.trim(),
        nameEn: document.getElementById('party-nameEn').value.trim() || undefined,
        taxNumber: document.getElementById('party-tax').value.trim() || undefined,
        phone: document.getElementById('party-phone').value.trim() || undefined,
        mobile: document.getElementById('party-mobile').value.trim() || undefined,
        email: document.getElementById('party-email').value.trim() || undefined,
        city: document.getElementById('party-city').value.trim() || undefined,
        address: document.getElementById('party-address').value.trim() || undefined,
        creditLimit: Number(document.getElementById('party-credit').value || 0),
        paymentTerms: Number(document.getElementById('party-terms').value || 30)
      };
      if (mode === 'suppliers') {
        payload.bankName = document.getElementById('party-bankName').value.trim() || undefined;
        payload.bankAccount = document.getElementById('party-bankAccount').value.trim() || undefined;
        payload.iban = document.getElementById('party-iban').value.trim() || undefined;
      }

      if (state.editingId) {
        await withToast(() => request(`${m.endpoint}/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), `تم تحديث بيانات ${m.singular}`);
      } else {
        await withToast(() => request(m.endpoint, { method: 'POST', body: JSON.stringify(payload) }), `تم إنشاء ${m.singular} جديد`);
      }

      state.editingId = null;
      state.form = emptyForm(m.codePrefix);
      await load();
    });

    document.getElementById('party-contact-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!state.selectedId) return;
      const payload = {
        name: document.getElementById('party-contact-name').value.trim(),
        position: document.getElementById('party-contact-position').value.trim() || undefined,
        phone: document.getElementById('party-contact-phone').value.trim() || undefined,
        mobile: document.getElementById('party-contact-mobile').value.trim() || undefined,
        email: document.getElementById('party-contact-email').value.trim() || undefined,
        isPrimary: document.getElementById('party-contact-primary').value === 'true'
      };
      await withToast(() => request(`${m.endpoint}/${state.selectedId}/contacts`, { method: 'POST', body: JSON.stringify(payload) }), 'تمت إضافة جهة الاتصال');
      await load();
    });

    view.querySelectorAll('[data-action="select"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.selectedId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const row = state.rows.find((r) => r.id === id);
        if (!row) return;
        state.editingId = id;
        state.selectedId = id;
        state.form = {
          code: row.code || '',
          nameAr: row.nameAr || '',
          nameEn: row.nameEn || '',
          taxNumber: row.taxNumber || '',
          phone: row.phone || '',
          mobile: row.mobile || '',
          email: row.email || '',
          city: row.city || '',
          address: row.address || '',
          paymentTerms: row.paymentTerms || 30,
          creditLimit: Number(row.creditLimit || 0),
          bankName: row.bankName || '',
          bankAccount: row.bankAccount || '',
          iban: row.iban || ''
        };
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction(`هل تريد حذف ${m.singular}؟`);
        if (!confirmed) return;
        await withToast(() => request(`${m.endpoint}/${id}`, { method: 'DELETE' }), `تم حذف ${m.singular}`);
        if (state.selectedId === id) state.selectedId = null;
        await load();
      });
    });

    setPageActions({
      onNew: () => document.getElementById('party-new')?.click(),
      onSave: () => document.getElementById('party-form')?.requestSubmit(),
      onSearch: () => searchInput?.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}

