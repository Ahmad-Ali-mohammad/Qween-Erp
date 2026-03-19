import { api, extractData, extractRows, resolveApiUrl, toQuery, withToast } from '../../core/api.js';
import { store } from '../../core/store.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table, toast } from '../../core/ui.js';

const yearCloseSteps = [
  { id: 1, title: 'التحقق من المتطلبات', description: 'التأكد من اكتمال جميع العمليات المطلوبة' },
  { id: 2, title: 'مراجعة الأرصدة', description: 'مراجعة أرصدة الحسابات وإعداد قائمة المراجعة' },
  { id: 3, title: 'إنشاء قيود الإقفال', description: 'إنشاء قيود إقفال الإيرادات والمصروفات' },
  { id: 4, title: 'إقفال السنة المالية', description: 'إقفال السنة وإنشاء قيد الافتتاح للسنة الجديدة' }
];

function renderRetryState(view, title, message, buttonId) {
  view.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <p class="error">${message}</p>
      <button id="${buttonId}" class="btn btn-primary">إعادة المحاولة</button>
    </div>
  `;
}

function downloadCsv(filename, headers, rows) {
  const body = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportLedger(state) {
  const response = await fetch(
    resolveApiUrl(
      `/journals/export${toQuery({
        dateFrom: state.fromDate,
        dateTo: state.toDate,
        accountId: state.accountId || undefined,
        entryNumber: state.entryNumber || undefined
      })}`
    ),
    {
      headers: store.token ? { Authorization: `Bearer ${store.token}` } : {}
    }
  );

  if (response.status === 401) {
    store.clearAuth();
    location.hash = '#/login';
    return;
  }

  if (!response.ok) {
    throw new Error('فشل في تصدير الأستاذ العام');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'general-ledger.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function renderGeneralLedger() {
  setTitle('الأستاذ العام');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الأستاذ العام...</div>';

  const state = {
    page: 1,
    limit: 50,
    fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    accountId: '',
    entryNumber: ''
  };

  const load = async () => {
    try {
      const [journalsRes, accountsRes] = await Promise.all([
        api(
          `/journals${toQuery({
            page: state.page,
            limit: state.limit,
            dateFrom: state.fromDate,
            dateTo: state.toDate,
            accountId: state.accountId || undefined,
            entryNumber: state.entryNumber || undefined
          })}`
        ),
        api('/accounts?page=1&limit=1000')
      ]);

      const journals = extractRows(journalsRes);
      const accounts = extractRows(accountsRes);
      const total = Number(journalsRes?.meta?.total ?? journalsRes?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / state.limit));

      view.innerHTML = `
        <div class="card">
          <h3>الأستاذ العام</h3>
          <form id="ledger-filters" class="grid-4">
            <div><label>من تاريخ</label><input id="ledger-from" type="date" value="${state.fromDate}" /></div>
            <div><label>إلى تاريخ</label><input id="ledger-to" type="date" value="${state.toDate}" /></div>
            <div><label>الحساب</label>
              <select id="ledger-account">
                <option value="">جميع الحسابات</option>
                ${accounts
                  .map(
                    (account) =>
                      `<option value="${account.id}" ${String(state.accountId) === String(account.id) ? 'selected' : ''}>${account.code} - ${account.nameAr}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div><label>رقم القيد</label><input id="ledger-entry" value="${state.entryNumber}" /></div>
            <div class="actions" style="grid-column:1 / -1;">
              <button type="submit" class="btn btn-primary">عرض</button>
              <button type="button" class="btn btn-secondary" id="ledger-export">تصدير Excel</button>
            </div>
          </form>
        </div>

        <div class="card">
          <h3>القيود المحاسبية (${total})</h3>
          ${table(
            ['التاريخ', 'رقم القيد', 'البيان', 'الحساب', 'مدين', 'دائن', 'الحالة'],
            journals.map((journal) => [
              formatDate(journal.date),
              journal.entryNumber,
              journal.description || '-',
              journal.lines?.map((line) => `${line.account?.code || ''} - ${line.account?.nameAr || ''}`).join('<br>') || '-',
              journal.lines?.map((line) => (line.debit > 0 ? formatMoney(line.debit) : '')).join('<br>') || '-',
              journal.lines?.map((line) => (line.credit > 0 ? formatMoney(line.credit) : '')).join('<br>') || '-',
              statusBadge(journal.status)
            ])
          )}
        </div>

        ${
          total > state.limit
            ? `
              <div class="card">
                <div class="pagination">
                  <button id="ledger-prev" ${state.page <= 1 ? 'disabled' : ''}>السابق</button>
                  <span>صفحة ${state.page} من ${totalPages}</span>
                  <button id="ledger-next" ${state.page >= totalPages ? 'disabled' : ''}>التالي</button>
                </div>
              </div>
            `
            : ''
        }
      `;

      document.getElementById('ledger-filters')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        state.fromDate = document.getElementById('ledger-from')?.value || state.fromDate;
        state.toDate = document.getElementById('ledger-to')?.value || state.toDate;
        state.accountId = document.getElementById('ledger-account')?.value || '';
        state.entryNumber = document.getElementById('ledger-entry')?.value || '';
        state.page = 1;
        await load();
      });

      document.getElementById('ledger-prev')?.addEventListener('click', async () => {
        if (state.page <= 1) return;
        state.page -= 1;
        await load();
      });

      document.getElementById('ledger-next')?.addEventListener('click', async () => {
        if (state.page >= totalPages) return;
        state.page += 1;
        await load();
      });

      document.getElementById('ledger-export')?.addEventListener('click', async () => {
        try {
          await exportLedger(state);
          toast('تم تصدير الأستاذ العام بنجاح', 'success');
        } catch (error) {
          toast(error.message || 'خطأ في التصدير', 'error');
        }
      });

      setPageActions({
        onRefresh: () => load(),
        onSearch: () => document.getElementById('ledger-entry')?.focus()
      });
    } catch (error) {
      console.error('Error loading general ledger:', error);
      renderRetryState(view, 'خطأ في تحميل الأستاذ العام', error.message, 'ledger-retry');
      document.getElementById('ledger-retry')?.addEventListener('click', () => load());
    }
  };

  await load();
}

export async function renderAccountStatement() {
  setTitle('كشف حساب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل كشف الحساب...</div>';

  const state = {
    type: 'ACCOUNT',
    id: '',
    fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    export: null
  };

  const renderReport = async () => {
    const panel = document.getElementById('statement-result');
    if (!panel) return;

    if (!state.id) {
      panel.innerHTML = '<p class="muted">اختر المعايير ثم اضغط "عرض الكشف".</p>';
      return;
    }

    panel.innerHTML = '<p class="muted">جاري تحميل البيانات...</p>';

    try {
      if (state.type === 'ACCOUNT') {
        const stmt =
          extractData(
            await api(
              `/reports/account-statement${toQuery({
                accountId: state.id,
                dateFrom: state.fromDate,
                dateTo: state.toDate
              })}`
            )
          ) || {};

        const rows = Array.isArray(stmt.rows) ? stmt.rows : [];
        const summary = stmt.summary || {};
        const totalDebit = Number(summary.totalDebit || 0);
        const totalCredit = Number(summary.totalCredit || 0);
        const closingBalance = Number(summary.closingBalance || 0);
        const openingBalance = Number(summary.openingBalance ?? closingBalance - totalDebit + totalCredit);

        panel.innerHTML = `
          <h3>كشف حساب: ${stmt.account?.code || ''} - ${stmt.account?.nameAr || ''}</h3>
          <div class="kpi-grid">
            <div class="kpi"><div>الرصيد الافتتاحي</div><div class="val">${formatMoney(openingBalance)}</div></div>
            <div class="kpi"><div>إجمالي المدين</div><div class="val">${formatMoney(totalDebit)}</div></div>
            <div class="kpi"><div>إجمالي الدائن</div><div class="val">${formatMoney(totalCredit)}</div></div>
            <div class="kpi"><div>الرصيد الختامي</div><div class="val">${formatMoney(closingBalance)}</div></div>
          </div>
          ${table(
            ['التاريخ', 'رقم القيد', 'البيان', 'مدين', 'دائن', 'الرصيد'],
            rows.map((row) => [
              formatDate(row.date),
              row.entryNumber || '-',
              row.description || '-',
              formatMoney(row.debit),
              formatMoney(row.credit),
              formatMoney(row.balance)
            ])
          )}
        `;

        state.export = {
          filename: `statement-account-${stmt.account?.code || state.id}.csv`,
          headers: ['Date', 'EntryNumber', 'Description', 'Debit', 'Credit', 'Balance'],
          rows: rows.map((row) => [
            formatDate(row.date),
            row.entryNumber || '',
            row.description || '',
            Number(row.debit || 0),
            Number(row.credit || 0),
            Number(row.balance || 0)
          ])
        };
        return;
      }

      const isCustomer = state.type === 'CUSTOMER';
      const endpoint = isCustomer ? `/customers/${state.id}/statement` : `/suppliers/${state.id}/statement`;
      const stmt = extractData(await api(`${endpoint}${toQuery({ startDate: state.fromDate, endDate: state.toDate })}`)) || {};
      const transactions = Array.isArray(stmt.transactions) ? stmt.transactions : [];
      const totalDebit = transactions.reduce((sum, tx) => sum + Number(tx.debit || 0), 0);
      const totalCredit = transactions.reduce((sum, tx) => sum + Number(tx.credit || 0), 0);
      const finalBalance = Number(stmt.finalBalance || 0);
      const partyName = isCustomer ? stmt.customer?.nameAr || stmt.customer?.code || state.id : stmt.supplier?.nameAr || stmt.supplier?.code || state.id;

      panel.innerHTML = `
        <h3>كشف ${isCustomer ? 'العميل' : 'المورد'}: ${partyName}</h3>
        <div class="kpi-grid">
          <div class="kpi"><div>إجمالي المدين</div><div class="val">${formatMoney(totalDebit)}</div></div>
          <div class="kpi"><div>إجمالي الدائن</div><div class="val">${formatMoney(totalCredit)}</div></div>
          <div class="kpi"><div>الرصيد الختامي</div><div class="val">${formatMoney(finalBalance)}</div></div>
        </div>
        ${table(
          ['التاريخ', 'النوع', 'الرقم', 'البيان', 'مدين', 'دائن', 'الرصيد'],
          transactions.map((tx) => [
            formatDate(tx.date),
            tx.type || '-',
            tx.number || '-',
            tx.description || '-',
            formatMoney(tx.debit || 0),
            formatMoney(tx.credit || 0),
            formatMoney(tx.balance || 0)
          ])
        )}
      `;

      state.export = {
        filename: `statement-${isCustomer ? 'customer' : 'supplier'}-${state.id}.csv`,
        headers: ['Date', 'Type', 'Number', 'Description', 'Debit', 'Credit', 'Balance'],
        rows: transactions.map((tx) => [
          formatDate(tx.date),
          tx.type || '',
          tx.number || '',
          tx.description || '',
          Number(tx.debit || 0),
          Number(tx.credit || 0),
          Number(tx.balance || 0)
        ])
      };
    } catch (error) {
      panel.innerHTML = `<p class="error">خطأ في تحميل الكشف: ${error.message}</p>`;
    }
  };

  const load = async () => {
    try {
      const [accountsRes, customersRes, suppliersRes] = await Promise.all([
        api('/accounts?page=1&limit=1000'),
        api('/customers?page=1&limit=1000'),
        api('/suppliers?page=1&limit=1000')
      ]);

      const accounts = extractRows(accountsRes).filter((account) => account.allowPosting);
      const customers = extractRows(customersRes);
      const suppliers = extractRows(suppliersRes);

      view.innerHTML = `
        <div class="card">
          <h3>إعداد كشف الحساب</h3>
          <form id="statement-form" class="grid-4">
            <div><label>نوع الكشف</label>
              <select id="stmt-type">
                <option value="ACCOUNT" ${state.type === 'ACCOUNT' ? 'selected' : ''}>حساب محاسبي</option>
                <option value="CUSTOMER" ${state.type === 'CUSTOMER' ? 'selected' : ''}>عميل</option>
                <option value="SUPPLIER" ${state.type === 'SUPPLIER' ? 'selected' : ''}>مورد</option>
              </select>
            </div>
            <div><label>العنصر</label>
              <select id="stmt-id" required>
                <option value="">اختر العنصر</option>
                ${
                  state.type === 'ACCOUNT'
                    ? accounts
                        .map(
                          (account) =>
                            `<option value="${account.id}" ${String(state.id) === String(account.id) ? 'selected' : ''}>${account.code} - ${account.nameAr}</option>`
                        )
                        .join('')
                    : state.type === 'CUSTOMER'
                      ? customers
                          .map(
                            (customer) =>
                              `<option value="${customer.id}" ${String(state.id) === String(customer.id) ? 'selected' : ''}>${customer.code} - ${customer.nameAr}</option>`
                          )
                          .join('')
                      : suppliers
                          .map(
                            (supplier) =>
                              `<option value="${supplier.id}" ${String(state.id) === String(supplier.id) ? 'selected' : ''}>${supplier.code} - ${supplier.nameAr}</option>`
                          )
                          .join('')
                }
              </select>
            </div>
            <div><label>من تاريخ</label><input id="stmt-from" type="date" value="${state.fromDate}" /></div>
            <div><label>إلى تاريخ</label><input id="stmt-to" type="date" value="${state.toDate}" /></div>
            <div class="actions" style="grid-column:1 / -1;">
              <button type="submit" class="btn btn-primary">عرض الكشف</button>
              <button type="button" class="btn btn-secondary" id="statement-export">تصدير CSV</button>
            </div>
          </form>
        </div>
        <div class="card" id="statement-result">
          <p class="muted">اختر المعايير ثم اضغط "عرض الكشف".</p>
        </div>
      `;

      document.getElementById('stmt-type')?.addEventListener('change', async (event) => {
        state.type = event.target.value;
        state.id = '';
        state.export = null;
        await load();
      });

      document.getElementById('statement-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('stmt-id')?.value || '';
        if (!id) {
          toast('يرجى اختيار عنصر لعرض الكشف', 'warning');
          return;
        }
        state.id = id;
        state.fromDate = document.getElementById('stmt-from')?.value || state.fromDate;
        state.toDate = document.getElementById('stmt-to')?.value || state.toDate;
        await renderReport();
      });

      document.getElementById('statement-export')?.addEventListener('click', () => {
        if (!state.export?.rows?.length) {
          toast('اعرض الكشف أولاً قبل التصدير', 'warning');
          return;
        }
        downloadCsv(state.export.filename, state.export.headers, state.export.rows);
        toast('تم تصدير كشف الحساب بنجاح', 'success');
      });

      setPageActions({
        onRefresh: () => load()
      });
    } catch (error) {
      console.error('Error loading account statement:', error);
      renderRetryState(view, 'خطأ في تحميل كشف الحساب', error.message, 'statement-retry');
      document.getElementById('statement-retry')?.addEventListener('click', () => load());
    }
  };

  await load();
}

export async function renderYearClose() {
  setTitle('معالج إقفال السنة المالية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل معالج إقفال السنة...</div>';

  const state = {
    currentStep: 1,
    fiscalYear: null,
    checks: [],
    readyToClose: false
  };

  const renderStepContent = () => {
    switch (state.currentStep) {
      case 1:
        return `
          <h3>التحقق من المتطلبات</h3>
          <div class="checks-list">
            ${state.checks
              .map(
                (check) => `
                  <div class="check-item ${check.status.toLowerCase()}">
                    <div class="check-icon">${check.status === 'PASS' ? '✓' : '✗'}</div>
                    <div class="check-details">
                      <h4>${check.title}</h4>
                      <p>${check.message}</p>
                    </div>
                  </div>
                `
              )
              .join('')}
          </div>
          <div class="step-actions">
            <button id="next-btn" class="btn btn-primary" ${!state.readyToClose ? 'disabled' : ''}>
              ${state.readyToClose ? 'التالي' : 'يرجى إكمال المتطلبات أولاً'}
            </button>
          </div>
        `;

      case 2:
        return `
          <h3>مراجعة الأرصدة</h3>
          <p>يرجى مراجعة أرصدة الحسابات التالية قبل المتابعة:</p>
          <div id="accounts-review" class="loading">جاري تحميل الأرصدة...</div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="next-btn" class="btn btn-primary">التالي</button>
          </div>
        `;

      case 3:
        return `
          <h3>إنشاء قيود الإقفال</h3>
          <p>سيتم إنشاء قيود إقفال الإيرادات والمصروفات تلقائياً:</p>
          <div id="closing-entries" class="loading">جاري إعداد قيود الإقفال...</div>
          <div class="warning">
            <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. تأكد من مراجعة البيانات بعناية.
          </div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="next-btn" class="btn btn-primary">إنشاء قيود الإقفال</button>
          </div>
        `;

      case 4:
        return `
          <h3>إقفال السنة المالية</h3>
          <p>الخطوة الأخيرة: إقفال السنة المالية وإنشاء قيد الافتتاح للسنة الجديدة.</p>
          <div class="summary">
            <h4>ملخص العملية:</h4>
            <ul>
              <li>إقفال السنة المالية الحالية</li>
              <li>إنشاء سنة مالية جديدة</li>
              <li>ترحيل الأرصدة الختامية كأرصدة افتتاحية</li>
            </ul>
          </div>
          <div class="warning">
            <strong>تحذير نهائي:</strong> هذه العملية لا يمكن التراجع عنها. تأكد من عمل نسخة احتياطية قبل المتابعة.
          </div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="close-year-btn" class="btn btn-danger">إقفال السنة المالية</button>
          </div>
        `;

      default:
        return '<p>خطوة غير معروفة</p>';
    }
  };

  const performChecks = async () => {
    try {
      const checks = [];
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      const checkRes = await api(`/year-close/check?fiscalYear=${fiscalYear}`);
      const result = extractData(checkRes) || {};
      const openPeriods = Number(result.openPeriods ?? 0);
      const draftEntries = Number(result.draftEntries ?? 0);

      checks.push({
        id: 'periods_closed',
        title: 'إقفال جميع الفترات المحاسبية',
        status: openPeriods === 0 ? 'PASS' : 'FAIL',
        message: openPeriods === 0 ? 'جميع الفترات مغلقة' : `يوجد ${openPeriods} فترة غير مغلقة`
      });
      checks.push({
        id: 'no_draft_journals',
        title: 'عدم وجود قيود مسودة',
        status: draftEntries === 0 ? 'PASS' : 'FAIL',
        message: draftEntries === 0 ? 'لا توجد قيود مسودة' : `يوجد ${draftEntries} قيد مسودة`
      });
      const trialBalanceRes = await api('/reports/trial-balance');
      const trial = extractData(trialBalanceRes) || {};
      const difference = Number(trial?.totals?.difference ?? 0);
      const isBalanced = Math.abs(difference) < 0.01;
      checks.push({
        id: 'trial_balance_balanced',
        title: 'توازن ميزان المراجعة',
        status: isBalanced ? 'PASS' : 'FAIL',
        message: isBalanced ? 'ميزان المراجعة متوازن' : 'ميزان المراجعة غير متوازن'
      });

      state.checks = checks;
      state.readyToClose = checks.every((check) => check.status === 'PASS');
    } catch (error) {
      console.error('Error performing checks:', error);
      state.checks = [];
      state.readyToClose = false;
    }
  };

  const nextStep = async () => {
    if (state.currentStep === 3) {
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      await withToast(
        () =>
          api('/year-close/transfer-balances', 'POST', {
            fiscalYear,
            nextFiscalYear: fiscalYear + 1
          }),
        'تم إنشاء قيود الإقفال'
      );
    }

    if (state.currentStep < yearCloseSteps.length) {
      state.currentStep += 1;
      await load();
    }
  };

  const prevStep = async () => {
    if (state.currentStep > 1) {
      state.currentStep -= 1;
      await load();
    }
  };

  const closeYear = async () => {
    if (!confirm('هل أنت متأكد من إقفال السنة المالية؟ هذه العملية لا يمكن التراجع عنها.')) {
      return;
    }

    try {
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      await withToast(
        () =>
          api('/year-close/opening-entry', 'POST', {
            fiscalYear,
            nextFiscalYear: fiscalYear + 1
          }),
        'تمت جدولة إنشاء قيد الافتتاح'
      );
      toast('تم تنفيذ إجراءات إقفال السنة وجدولة قيد الافتتاح', 'success');
      location.hash = '#/dashboard';
    } catch {
      toast('فشل في إقفال السنة المالية', 'error');
    }
  };

  const load = async () => {
    try {
      const fiscalYearsRes = await api('/fiscal-years?status=ACTIVE');
      const fiscalYears = extractRows(fiscalYearsRes);
      const activeYear = fiscalYears.find((year) => year.status === 'OPEN' || year.isCurrent) || fiscalYears[0];

      if (!activeYear) {
        view.innerHTML = `
          <div class="card">
            <h3>معالج إقفال السنة المالية</h3>
            <p class="error">لا توجد سنة مالية نشطة حالياً.</p>
            <p>يرجى إنشاء سنة مالية جديدة أولاً.</p>
          </div>
        `;
        return;
      }

      state.fiscalYear = activeYear;
      await performChecks();

      view.innerHTML = `
        <div class="card">
          <h3>معالج إقفال السنة المالية</h3>
          <div class="year-info">
            <div><strong>السنة المالية:</strong> ${activeYear.name}</div>
            <div><strong>من:</strong> ${formatDate(activeYear.startDate)} <strong>إلى:</strong> ${formatDate(activeYear.endDate)}</div>
            <div><strong>الحالة:</strong> ${activeYear.status === 'ACTIVE' ? 'نشطة' : activeYear.status}</div>
          </div>
        </div>

        <div class="steps-container">
          ${yearCloseSteps
            .map(
              (step) => `
                <div class="step ${state.currentStep >= step.id ? 'active' : ''} ${state.currentStep > step.id ? 'completed' : ''}">
                  <div class="step-number">${step.id}</div>
                  <div class="step-content">
                    <h4>${step.title}</h4>
                    <p>${step.description}</p>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>

        <div class="card" id="step-content">
          ${renderStepContent()}
        </div>
      `;

      document.getElementById('next-btn')?.addEventListener('click', () => nextStep());
      document.getElementById('prev-btn')?.addEventListener('click', () => prevStep());
      document.getElementById('close-year-btn')?.addEventListener('click', () => closeYear());

      setPageActions({
        onRefresh: () => load()
      });
    } catch (error) {
      console.error('Error loading year close wizard:', error);
      renderRetryState(view, 'خطأ في تحميل معالج الإقفال', error.message, 'year-close-retry');
      document.getElementById('year-close-retry')?.addEventListener('click', () => load());
    }
  };

  await load();
}
