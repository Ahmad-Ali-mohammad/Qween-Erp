import { request, api, withToast, toQuery, extractRows, extractData } from '../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, toast, setPageActions } from '../core/ui.js';

export async function renderQuickJournal() {
  setTitle('قيد سريع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل شاشة القيد السريع...</div>';

  const load = async () => {
    const [accountsRes, periodsRes, journalsRes] = await Promise.all([
      request('/accounts?page=1&limit=500'),
      request('/periods'),
      request('/journals?page=1&limit=10')
    ]);

    const postingAccounts = extractRows(accountsRes).filter((account) => account.allowPosting && account.isActive);
    const openPeriods = extractRows(periodsRes).filter((period) => period.status === 'OPEN' && period.canPost);
    const recent = extractRows(journalsRes);

    view.innerHTML = `
      <div class="card">
        <h3>إنشاء قيد يومية سريع</h3>
        <form id="quick-journal-form" class="grid-3">
          <div><label>التاريخ</label><input id="qj-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>الفترة المحاسبية</label>
            <select id="qj-periodId">
              <option value="">بدون تحديد</option>
              ${openPeriods.map((period) => `<option value="${period.id}">${period.fiscalYear?.name || ''} - ${period.name}</option>`).join('')}
            </select>
          </div>
          <div><label>المرجع</label><input id="qj-ref" placeholder="REF-001" /></div>
          <div style="grid-column:1 / -1;"><label>البيان</label><input id="qj-desc" placeholder="وصف القيد" required /></div>
          <div><label>الحساب المدين</label>
            <select id="qj-debit" required>
              <option value="">اختر الحساب</option>
              ${postingAccounts.map((account) => `<option value="${account.id}">${account.code} - ${account.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>الحساب الدائن</label>
            <select id="qj-credit" required>
              <option value="">اختر الحساب</option>
              ${postingAccounts.map((account) => `<option value="${account.id}">${account.code} - ${account.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>المبلغ</label><input id="qj-amount" type="number" min="0.01" step="0.01" value="0" required /></div>
          <div style="grid-column:1 / -1;"><label><input type="checkbox" id="qj-post-now" checked /> ترحيل القيد مباشرةً بعد الحفظ</label></div>
          <div class="actions" style="grid-column:1 / -1;">
            <button type="submit" class="btn btn-primary">حفظ القيد</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>آخر القيود</h3>
        ${table(
          ['رقم القيد', 'التاريخ', 'البيان', 'مدين', 'دائن', 'الحالة'],
          recent.map((journal) => [
            journal.entryNumber,
            formatDate(journal.date),
            journal.description || '-',
            formatMoney(journal.totalDebit),
            formatMoney(journal.totalCredit),
            statusBadge(journal.status)
          ])
        )}
      </div>
    `;

    document.getElementById('quick-journal-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const debitId = Number(document.getElementById('qj-debit').value || 0);
      const creditId = Number(document.getElementById('qj-credit').value || 0);
      const amount = Number(document.getElementById('qj-amount').value || 0);
      if (!debitId || !creditId || amount <= 0) {
        toast('يرجى استكمال الحسابات والمبلغ بشكل صحيح', 'warning');
        return;
      }
      if (debitId === creditId) {
        toast('لا يمكن اختيار نفس الحساب في الطرفين المدين والدائن', 'warning');
        return;
      }

      const description = document.getElementById('qj-desc').value.trim();
      const payload = {
        date: document.getElementById('qj-date').value,
        reference: document.getElementById('qj-ref').value.trim() || undefined,
        description,
        lines: [
          { accountId: debitId, description, debit: amount, credit: 0 },
          { accountId: creditId, description, debit: 0, credit: amount }
        ]
      };

      const created = await withToast(() => api('/journals', 'POST', payload), 'تم إنشاء القيد');
      if (document.getElementById('qj-post-now').checked) {
        await withToast(() => api(`/journals/${created.data.id}/post`, 'POST'), 'تم ترحيل القيد');
      }
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('quick-journal-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

export async function renderQuickInvoice() {
  setTitle('فاتورة سريعة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل شاشة الفاتورة السريعة...</div>';

  const state = { type: 'SALES' };

  const load = async () => {
    let parties = [];
    let recent = [];

    try {
      const [customersRes, suppliersRes, invoicesRes] = await Promise.all([
        api('/customers'),
        api('/suppliers'),
        api(`/invoices${toQuery({ page: 1, limit: 10, type: state.type })}`)
      ]);

      const customers = extractRows(customersRes);
      const suppliers = extractRows(suppliersRes);
      parties = state.type === 'SALES' ? customers : suppliers;
      recent = extractRows(invoicesRes);
    } catch (error) {
      console.error('Error loading data:', error);
    }

    view.innerHTML = `
      <div class="card">
        <h3>إنشاء فاتورة سريعة</h3>
        <form id="quick-invoice-form" class="grid-3">
          <div><label>نوع الفاتورة</label>
            <select id="qi-type">
              <option value="SALES" ${state.type === 'SALES' ? 'selected' : ''}>مبيعات</option>
              <option value="PURCHASE" ${state.type === 'PURCHASE' ? 'selected' : ''}>مشتريات</option>
            </select>
          </div>
          <div><label>${state.type === 'SALES' ? 'العميل' : 'المورد'}</label>
            <select id="qi-party" required>
              <option value="">اختر ${state.type === 'SALES' ? 'العميل' : 'المورد'}</option>
              ${parties.map((party) => `<option value="${party.id}">${party.code} - ${party.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>تاريخ الفاتورة</label><input id="qi-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>تاريخ الاستحقاق</label><input id="qi-due" type="date" value="${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}" /></div>
          <div><label>الوصف</label><input id="qi-desc" value="${state.type === 'SALES' ? 'مبيعات سريعة' : 'مشتريات سريعة'}" required /></div>
          <div><label>الكمية</label><input id="qi-qty" type="number" min="0.01" step="0.01" value="1" required /></div>
          <div><label>سعر الوحدة</label><input id="qi-price" type="number" min="0" step="0.01" value="0" required /></div>
          <div><label>الخصم</label><input id="qi-discount" type="number" min="0" step="0.01" value="0" /></div>
          <div><label>الضريبة %</label><input id="qi-tax" type="number" min="0" step="0.01" value="15" /></div>
          <div style="grid-column:1 / -1;"><label><input type="checkbox" id="qi-issue-now" checked /> إصدار الفاتورة مباشرةً بعد الحفظ</label></div>
          <div class="actions" style="grid-column:1 / -1;">
            <button type="submit" class="btn btn-primary">حفظ الفاتورة</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>آخر الفواتير (${state.type === 'SALES' ? 'مبيعات' : 'مشتريات'})</h3>
        ${table(
          ['رقم الفاتورة', 'التاريخ', state.type === 'SALES' ? 'العميل' : 'المورد', 'الإجمالي', 'الحالة'],
          recent.map((invoice) => [
            invoice.number,
            formatDate(invoice.date),
            invoice.customer?.nameAr || invoice.supplier?.nameAr || '-',
            formatMoney(invoice.total),
            statusBadge(invoice.status)
          ])
        )}
      </div>
    `;

    document.getElementById('qi-type')?.addEventListener('change', async (event) => {
      state.type = event.target.value;
      await load();
    });

    document.getElementById('quick-invoice-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const type = document.getElementById('qi-type').value;
      const partyId = Number(document.getElementById('qi-party').value || 0);
      if (!partyId) {
        toast(`يرجى اختيار ${type === 'SALES' ? 'العميل' : 'المورد'}`, 'warning');
        return;
      }

      const payload = {
        type,
        date: document.getElementById('qi-date').value,
        dueDate: document.getElementById('qi-due').value || undefined,
        customerId: type === 'SALES' ? partyId : undefined,
        supplierId: type === 'PURCHASE' ? partyId : undefined,
        lines: [
          {
            description: document.getElementById('qi-desc').value.trim(),
            quantity: Number(document.getElementById('qi-qty').value || 0),
            unitPrice: Number(document.getElementById('qi-price').value || 0),
            discount: Number(document.getElementById('qi-discount').value || 0),
            taxRate: Number(document.getElementById('qi-tax').value || 15)
          }
        ]
      };

      if (!payload.lines[0].description || payload.lines[0].quantity <= 0) {
        toast('يرجى إدخال وصف وكمية صحيحة', 'warning');
        return;
      }

      const created = await withToast(() => api('/invoices', 'POST', payload), 'تم إنشاء الفاتورة');
      if (document.getElementById('qi-issue-now').checked) {
        await withToast(() => api(`/invoices/${created.data.id}/issue`, 'POST'), 'تم إصدار الفاتورة');
      }
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('quick-invoice-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

export async function renderQuickStatement() {
  setTitle('كشف حساب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل شاشة كشف الحساب...</div>';

  const state = { type: 'ACCOUNT' };

  const load = async () => {
    const [accountsRes, customersRes, suppliersRes] = await Promise.all([api('/accounts?page=1&limit=500'), api('/customers'), api('/suppliers')]);

    const accounts = extractRows(accountsRes).filter((account) => account.allowPosting);
    const customers = extractRows(customersRes);
    const suppliers = extractRows(suppliersRes);
    const list = state.type === 'ACCOUNT' ? accounts : state.type === 'CUSTOMER' ? customers : suppliers;

    view.innerHTML = `
      <div class="card">
        <h3>إعداد كشف الحساب</h3>
        <form id="quick-statement-form" class="grid-3">
          <div><label>نوع الكشف</label>
            <select id="qs-type">
              <option value="ACCOUNT" ${state.type === 'ACCOUNT' ? 'selected' : ''}>حساب محاسبي</option>
              <option value="CUSTOMER" ${state.type === 'CUSTOMER' ? 'selected' : ''}>عميل</option>
              <option value="SUPPLIER" ${state.type === 'SUPPLIER' ? 'selected' : ''}>مورد</option>
            </select>
          </div>
          <div><label>العنصر</label>
            <select id="qs-id" required>
              <option value="">اختر العنصر</option>
              ${list.map((entry) => `<option value="${entry.id}">${entry.code} - ${entry.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>من تاريخ</label><input id="qs-from" type="date" value="${new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)}" /></div>
          <div><label>إلى تاريخ</label><input id="qs-to" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
          <div class="actions" style="grid-column:1 / -1;">
            <button type="submit" class="btn btn-primary">عرض الكشف</button>
          </div>
        </form>
      </div>

      <div class="card" id="qs-result">
        <p class="muted">اختر المعايير ثم اضغط "عرض الكشف".</p>
      </div>
    `;

    document.getElementById('qs-type')?.addEventListener('change', async (event) => {
      state.type = event.target.value;
      await load();
    });

    document.getElementById('quick-statement-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = Number(document.getElementById('qs-id').value || 0);
      if (!id) {
        toast('يرجى اختيار عنصر لعرض الكشف', 'warning');
        return;
      }

      const from = document.getElementById('qs-from').value;
      const to = document.getElementById('qs-to').value;
      const panel = document.getElementById('qs-result');

      if (state.type === 'ACCOUNT') {
        const stmt = extractData(await api(`/reports/account-statement${toQuery({ accountId: id, dateFrom: from, dateTo: to })}`)) || {};
        const rows = Array.isArray(stmt.rows) ? stmt.rows : [];
        panel.innerHTML = `
          <h3>كشف حساب: ${stmt.account?.code || ''} - ${stmt.account?.nameAr || ''}</h3>
          ${table(
            ['التاريخ', 'رقم القيد', 'البيان', 'مدين', 'دائن', 'الرصيد'],
            rows.map((row) => [formatDate(row.date), row.entryNumber, row.description || '-', formatMoney(row.debit), formatMoney(row.credit), formatMoney(row.balance)])
          )}
        `;
        return;
      }

      const isCustomer = state.type === 'CUSTOMER';
      const invoicesRes = await api(
        `/invoices${toQuery({
          page: 1,
          limit: 100,
          type: isCustomer ? 'SALES' : 'PURCHASE',
          customerId: isCustomer ? id : undefined,
          supplierId: isCustomer ? undefined : id
        })}`
      );
      const paymentsRes = await api('/payments?page=1&limit=200');

      const invoices = extractRows(invoicesRes);
      const payments = extractRows(paymentsRes).filter((payment) => (isCustomer ? payment.customerId === id : payment.supplierId === id));
      const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
      const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding || 0), 0);

      panel.innerHTML = `
        <h3>كشف ${isCustomer ? 'العميل' : 'المورد'}</h3>
        <div class="kpi-grid">
          <div class="kpi"><div>إجمالي الفواتير</div><div class="val">${formatMoney(invoiceTotal)}</div></div>
          <div class="kpi"><div>إجمالي السداد</div><div class="val">${formatMoney(paidTotal)}</div></div>
          <div class="kpi"><div>المتبقي</div><div class="val">${formatMoney(outstanding)}</div></div>
        </div>
        <div style="margin-top: 12px;">
          ${table(
            ['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
            invoices.map((invoice) => [
              invoice.number,
              formatDate(invoice.date),
              formatMoney(invoice.total),
              formatMoney(invoice.paidAmount),
              formatMoney(invoice.outstanding),
              statusBadge(invoice.status)
            ])
          )}
        </div>
      `;
    });

    setPageActions({
      onSearch: () => document.getElementById('qs-id')?.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}

export async function renderGlobalSearch() {
  setTitle('البحث الشامل');
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="card">
      <h3>البحث الشامل</h3>
      <form id="quick-search-form" class="search-row">
        <input id="qsearch-keyword" placeholder="اكتب كلمة البحث (فاتورة، عميل، قيد...)" />
        <button class="btn btn-primary" type="submit">بحث</button>
      </form>
    </div>
    <div class="card" id="qsearch-result"><p class="muted">أدخل كلمة البحث لعرض النتائج.</p></div>
  `;

  const runSearch = async () => {
    const keyword = document.getElementById('qsearch-keyword').value.trim().toLowerCase();
    const panel = document.getElementById('qsearch-result');
    if (!keyword) {
      panel.innerHTML = '<p class="muted">يرجى إدخال كلمة بحث.</p>';
      return;
    }

    panel.innerHTML = '<p class="muted">جاري البحث...</p>';

    const [journalsRes, invoicesRes, paymentsRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
      api('/journals?page=1&limit=100'),
      api('/invoices?page=1&limit=100'),
      api('/payments?page=1&limit=100'),
      api('/customers'),
      api('/suppliers'),
      api('/accounts?page=1&limit=500')
    ]);

    const contains = (text) => String(text || '').toLowerCase().includes(keyword);
    const journals = extractRows(journalsRes).filter((row) => contains(row.entryNumber) || contains(row.description) || contains(row.reference));
    const invoices = extractRows(invoicesRes).filter((row) => contains(row.number) || contains(row.notes) || contains(row.customer?.nameAr) || contains(row.supplier?.nameAr));
    const payments = extractRows(paymentsRes).filter((row) => contains(row.number) || contains(row.description) || contains(row.customer?.nameAr) || contains(row.supplier?.nameAr));
    const customers = extractRows(customersRes).filter((row) => contains(row.code) || contains(row.nameAr) || contains(row.mobile) || contains(row.email));
    const suppliers = extractRows(suppliersRes).filter((row) => contains(row.code) || contains(row.nameAr) || contains(row.mobile) || contains(row.email));
    const accounts = extractRows(accountsRes).filter((row) => contains(row.code) || contains(row.nameAr) || contains(row.nameEn));

    panel.innerHTML = `
      <h3>نتائج البحث عن: "${keyword}"</h3>
      <div class="grid-2">
        <div class="card compact">
          <h4>القيود (${journals.length})</h4>
          <ul class="panel-list">${journals.slice(0, 10).map((row) => `<li>${row.entryNumber} - ${row.description || '-'}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
        <div class="card compact">
          <h4>الفواتير (${invoices.length})</h4>
          <ul class="panel-list">${invoices.slice(0, 10).map((row) => `<li>${row.number} - ${formatMoney(row.total)}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
        <div class="card compact">
          <h4>المدفوعات (${payments.length})</h4>
          <ul class="panel-list">${payments.slice(0, 10).map((row) => `<li>${row.number} - ${formatMoney(row.amount)}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
        <div class="card compact">
          <h4>العملاء (${customers.length})</h4>
          <ul class="panel-list">${customers.slice(0, 10).map((row) => `<li>${row.code} - ${row.nameAr}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
        <div class="card compact">
          <h4>الموردون (${suppliers.length})</h4>
          <ul class="panel-list">${suppliers.slice(0, 10).map((row) => `<li>${row.code} - ${row.nameAr}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
        <div class="card compact">
          <h4>الحسابات (${accounts.length})</h4>
          <ul class="panel-list">${accounts.slice(0, 10).map((row) => `<li>${row.code} - ${row.nameAr}</li>`).join('') || '<li>لا يوجد</li>'}</ul>
        </div>
      </div>
    `;
  };

  document.getElementById('quick-search-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSearch();
  });

  setPageActions({
    onSearch: () => document.getElementById('qsearch-keyword')?.focus(),
    onRefresh: () => runSearch()
  });
}
