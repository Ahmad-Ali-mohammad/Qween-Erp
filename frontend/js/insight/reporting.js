import { request, toQuery, withToast } from '../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, setPageActions } from '../core/ui.js';
import { asArray, asNumber, buildPreviousPeriod, startOfMonthIso } from './report-utils.js';

export async function renderReports(mode = 'trial-balance') {
  if (mode === 'income-statement') return renderIncomeStatement();
  if (mode === 'balance-sheet') return renderBalanceSheet();
  if (mode === 'kpis') return renderKpis();
  if (mode === 'aging') return renderAging();
  if (mode === 'cash-flow') return renderCashFlow();
  if (mode === 'income-comparative') return renderComparativeIncome();
  if (mode === 'custom') return renderCustomReports();
  if (mode === 'schedules') return renderScheduledReports();
  if (mode === 'abc') return renderAbcAnalysis();
  if (mode === 'clv') return renderCustomerLifetimeValue();
  if (mode === 'forecast') return renderSalesForecast();
  if (mode === 'bsc') return renderBalancedScorecard();
  return renderTrialBalance();
}

async function renderTrialBalance() {
  setTitle('ميزان المراجعة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل التقرير...</div>';

  const state = {
    fiscalYear: new Date().getFullYear(),
    period: ''
  };

  const load = async () => {
    const [reportRes, accountsRes] = await Promise.all([
      request(`/reports/trial-balance${toQuery({ fiscalYear: state.fiscalYear, period: state.period || undefined })}`),
      request('/accounts?page=1&limit=500')
    ]);

    const accounts = asArray(reportRes.data?.accounts);
    const totals = reportRes.data?.totals || { debit: 0, credit: 0, difference: 0 };
    const postingAccounts = asArray(accountsRes.data).filter((a) => a.allowPosting);

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>معايير التقرير</h3>
          <div class="actions">
            <button id="tb-show" class="btn btn-primary btn-sm">عرض</button>
            <button id="tb-print" class="btn btn-secondary btn-sm">طباعة</button>
          </div>
        </div>
        <div class="grid-3">
          <div><label>السنة المالية</label><input id="tb-year" type="number" value="${state.fiscalYear}" /></div>
          <div><label>الفترة</label><input id="tb-period" type="number" min="1" max="12" value="${state.period}" placeholder="اختياري" /></div>
          <div><label>حساب تفصيلي</label>
            <select id="tb-account"><option value="">بدون كشف حساب</option>${postingAccounts.map((a) => `<option value="${a.id}">${a.code} - ${a.nameAr}</option>`).join('')}</select>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>نتائج ميزان المراجعة</h3>
        ${table(
          ['كود الحساب', 'اسم الحساب', 'مدين', 'دائن', 'الرصيد'],
          accounts.map((r) => [r.account?.code, r.account?.nameAr, formatMoney(r.debit), formatMoney(r.credit), formatMoney(r.closingBalance)])
        )}
        <div class="toolbar" style="margin-top:10px;">
          <strong>إجمالي المدين: ${formatMoney(totals.debit)}</strong>
          <strong>إجمالي الدائن: ${formatMoney(totals.credit)}</strong>
          <strong>${Math.abs(Number(totals.difference)) < 0.01 ? statusBadge('POSTED') : statusBadge('DRAFT')}</strong>
        </div>
      </div>

      <div class="card" id="account-statement-panel">
        <h3>كشف حساب</h3>
        <p class="muted">اختر حساباً ثم اضغط "عرض" لإظهار كشف الحساب.</p>
      </div>
    `;

    document.getElementById('tb-show').addEventListener('click', async () => {
      state.fiscalYear = Number(document.getElementById('tb-year').value || new Date().getFullYear());
      state.period = document.getElementById('tb-period').value;
      await load();

      const accountId = Number(document.getElementById('tb-account').value || 0);
      if (accountId) {
        const from = `${state.fiscalYear}-01-01`;
        const to = `${state.fiscalYear}-12-31`;
        const stmt = await request(`/reports/account-statement${toQuery({ accountId, dateFrom: from, dateTo: to })}`);
        const rows = asArray(stmt.data?.rows);
        document.getElementById('account-statement-panel').innerHTML = `
          <h3>كشف حساب: ${stmt.data?.account?.code} - ${stmt.data?.account?.nameAr}</h3>
          ${table(
            ['التاريخ', 'رقم القيد', 'البيان', 'مدين', 'دائن', 'الرصيد'],
            rows.map((r) => [formatDate(r.date), r.entryNumber, r.description || '-', formatMoney(r.debit), formatMoney(r.credit), formatMoney(r.balance)])
          )}
        `;
      }
    });

    document.getElementById('tb-print').addEventListener('click', () => window.print());

    setPageActions({
      onSearch: () => document.getElementById('tb-account').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderIncomeStatement() {
  setTitle('قائمة الدخل');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل التقرير...</div>';

  const state = {
    dateFrom: `${new Date().getFullYear()}-01-01`,
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const report = await request(`/reports/income-statement${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const d = report.data || {};

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>معايير التقرير</h3>
          <button id="is-show" class="btn btn-primary btn-sm">عرض</button>
        </div>
        <div class="grid-2">
          <div><label>من تاريخ</label><input id="is-from" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input id="is-to" type="date" value="${state.dateTo}" /></div>
        </div>
      </div>

      <div class="card">
        <h3>قائمة الدخل للفترة ${formatDate(state.dateFrom)} - ${formatDate(state.dateTo)}</h3>
        <div class="grid-3">
          <div class="kpi"><div>إجمالي الإيرادات</div><div class="val">${formatMoney(d.totalRevenue)}</div></div>
          <div class="kpi"><div>إجمالي المصروفات</div><div class="val">${formatMoney(d.totalExpenses)}</div></div>
          <div class="kpi"><div>صافي الربح</div><div class="val">${formatMoney(d.netIncome)}</div></div>
        </div>
      </div>
    `;

    document.getElementById('is-show').addEventListener('click', async () => {
      state.dateFrom = document.getElementById('is-from').value;
      state.dateTo = document.getElementById('is-to').value;
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderBalanceSheet() {
  setTitle('الميزانية العمومية');
  const view = document.getElementById('view');
  const state = { asOfDate: new Date().toISOString().slice(0, 10) };

  const load = async () => {
    const report = await request(`/reports/balance-sheet${toQuery({ asOfDate: state.asOfDate })}`);
    const d = report.data || {};
    const totals = d.totals || {};

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>معايير التقرير</h3>
          <div class="actions">
            <input id="bs-date" type="date" value="${state.asOfDate}" />
            <button id="bs-show" class="btn btn-primary btn-sm">عرض</button>
          </div>
        </div>
      </div>

      <div class="grid-3">
        <div class="kpi"><div>إجمالي الأصول</div><div class="val">${formatMoney(totals.totalAssets)}</div></div>
        <div class="kpi"><div>إجمالي الخصوم</div><div class="val">${formatMoney(totals.totalLiabilities)}</div></div>
        <div class="kpi"><div>إجمالي حقوق الملكية</div><div class="val">${formatMoney(totals.totalEquity)}</div></div>
      </div>

      <div class="card">
        <h3>ملخص التوازن</h3>
        ${table(
          ['البند', 'القيمة'],
          [
            ['إجمالي الأصول', formatMoney(totals.totalAssets)],
            ['إجمالي الخصوم + حقوق الملكية', formatMoney(totals.totalLiabilitiesAndEquity)],
            ['الحالة', totals.balanced ? statusBadge('POSTED') : statusBadge('DRAFT')]
          ]
        )}
      </div>
    `;

    document.getElementById('bs-show').addEventListener('click', async () => {
      state.asOfDate = document.getElementById('bs-date').value;
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderKpis() {
  setTitle('مؤشرات الأداء');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مؤشرات الأداء...</div>';

  const load = async () => {
    const kpi = await request('/reports/kpis');
    const data = kpi.data || {};

    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>القيود المسودة</div><div class="val">${asNumber(data.draftEntries)}</div></div>
        <div class="kpi"><div>الفواتير المعلقة</div><div class="val">${asNumber(data.pendingInvoices)}</div></div>
        <div class="kpi"><div>المدفوعات المعلقة</div><div class="val">${asNumber(data.pendingPayments)}</div></div>
        <div class="kpi"><div>الأصول النشطة</div><div class="val">${asNumber(data.activeAssets)}</div></div>
      </div>
      <div class="card">
        <h3>ملخص</h3>
        <p class="muted">تظهر هذه الصفحة مؤشرات الأداء التشغيلية المباشرة من النظام.</p>
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderAging() {
  setTitle('تحليل الأعمار');
  const view = document.getElementById('view');
  const state = { type: 'customers', asOfDate: new Date().toISOString().slice(0, 10) };

  const load = async () => {
    const rows = asArray((await request(`/reports/aging${toQuery({ type: state.type, asOfDate: state.asOfDate })}`)).data);
    const total = rows.reduce((sum, row) => sum + asNumber(row.total), 0);

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>معايير التقرير</h3>
          <button id="aging-show" class="btn btn-primary btn-sm">عرض</button>
        </div>
        <div class="grid-3">
          <div><label>النوع</label>
            <select id="aging-type">
              <option value="customers" ${state.type === 'customers' ? 'selected' : ''}>العملاء</option>
              <option value="suppliers" ${state.type === 'suppliers' ? 'selected' : ''}>الموردين</option>
            </select>
          </div>
          <div><label>حتى تاريخ</label><input id="aging-date" type="date" value="${state.asOfDate}" /></div>
          <div class="kpi"><div>إجمالي الرصيد</div><div class="val">${formatMoney(total)}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>نتيجة تحليل الأعمار</h3>
        ${table(
          ['الكود', 'الاسم', 'الإجمالي', '0-30 يوم', '31-60 يوم', '61-90 يوم', 'أكثر من 90 يوم'],
          rows.map((r) => [
            r.code || '-',
            r.nameAr || '-',
            formatMoney(r.total),
            formatMoney(r.bucket0to30),
            formatMoney(r.bucket31to60),
            formatMoney(r.bucket61to90),
            formatMoney(r.bucket90plus)
          ])
        )}
      </div>
    `;

    document.getElementById('aging-show').addEventListener('click', async () => {
      state.type = document.getElementById('aging-type').value;
      state.asOfDate = document.getElementById('aging-date').value;
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderCashFlow() {
  setTitle('التدفقات النقدية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تقرير التدفقات النقدية...</div>';

  const load = async () => {
    const data = (await request('/reports/cash-flow')).data || {};
    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>التدفقات الداخلة</div><div class="val">${formatMoney(data.operatingInflow)}</div></div>
        <div class="kpi"><div>التدفقات الخارجة</div><div class="val">${formatMoney(data.operatingOutflow)}</div></div>
        <div class="kpi"><div>صافي التدفق</div><div class="val">${formatMoney(data.netCashFlow)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['البند', 'القيمة'],
          [
            ['التدفقات النقدية الداخلة (تشغيلي)', formatMoney(data.operatingInflow)],
            ['التدفقات النقدية الخارجة (تشغيلي)', formatMoney(data.operatingOutflow)],
            ['صافي التدفق النقدي', formatMoney(data.netCashFlow)]
          ]
        )}
      </div>
    `;
    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderComparativeIncome() {
  setTitle('قائمة دخل مقارنة');
  const view = document.getElementById('view');
  const currentFrom = startOfMonthIso();
  const currentTo = new Date().toISOString().slice(0, 10);
  const previous = buildPreviousPeriod(currentFrom, currentTo);
  const state = {
    currentFrom,
    currentTo,
    previousFrom: previous.previousFrom,
    previousTo: previous.previousTo
  };

  const load = async () => {
    const data = (await request(`/reports/income-comparative${toQuery(state)}`)).data || {};
    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>فترات المقارنة</h3>
          <button id="ic-show" class="btn btn-primary btn-sm">عرض</button>
        </div>
        <div class="grid-2">
          <div><label>الفترة الحالية - من</label><input id="ic-current-from" type="date" value="${state.currentFrom}" /></div>
          <div><label>الفترة الحالية - إلى</label><input id="ic-current-to" type="date" value="${state.currentTo}" /></div>
          <div><label>الفترة السابقة - من</label><input id="ic-prev-from" type="date" value="${state.previousFrom}" /></div>
          <div><label>الفترة السابقة - إلى</label><input id="ic-prev-to" type="date" value="${state.previousTo}" /></div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div>إجمالي الفترة الحالية</div><div class="val">${formatMoney(data.current)}</div></div>
        <div class="kpi"><div>إجمالي الفترة السابقة</div><div class="val">${formatMoney(data.previous)}</div></div>
        <div class="kpi"><div>قيمة الفرق</div><div class="val">${formatMoney(data.delta)}</div></div>
        <div class="kpi"><div>نسبة التغير</div><div class="val">${asNumber(data.changePct).toFixed(2)}%</div></div>
      </div>
    `;

    document.getElementById('ic-show').addEventListener('click', async () => {
      state.currentFrom = document.getElementById('ic-current-from').value;
      state.currentTo = document.getElementById('ic-current-to').value;
      state.previousFrom = document.getElementById('ic-prev-from').value;
      state.previousTo = document.getElementById('ic-prev-to').value;
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderCustomReports() {
  setTitle('تقارير مخصصة');
  const view = document.getElementById('view');

  const load = async () => {
    const rows = asArray((await request('/reports/custom')).data);
    view.innerHTML = `
      <div class="card">
        <h3>إنشاء تقرير مخصص</h3>
        <form id="custom-report-form" class="grid-3">
          <div><label>اسم التقرير</label><input id="cr-name" required /></div>
          <div><label>النوع</label><input id="cr-type" value="GENERAL" /></div>
          <div><label>الحالة</label><input id="cr-status" value="ACTIVE" /></div>
          <div style="grid-column:1 / -1;"><label>إعدادات التقرير (JSON)</label><textarea id="cr-definition" rows="5" placeholder='{"columns":["name","amount"]}'></textarea></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ التقرير</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة التقارير المخصصة</h3>
        ${table(
          ['المعرف', 'الاسم', 'النوع', 'الحالة', 'آخر تحديث'],
          rows.map((r) => [r.id, r.name || r.title || '-', r.type || '-', r.status || '-', r.updatedAt ? formatDate(r.updatedAt) : '-'])
        )}
      </div>
    `;

    document.getElementById('custom-report-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await withToast(async () => {
        let definition = {};
        const raw = document.getElementById('cr-definition').value.trim();
        if (raw) {
          try {
            definition = JSON.parse(raw);
          } catch {
            throw new Error('صيغة JSON غير صحيحة في إعدادات التقرير');
          }
        }

        return request('/reports/custom', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('cr-name').value.trim(),
            type: document.getElementById('cr-type').value.trim() || 'GENERAL',
            status: document.getElementById('cr-status').value.trim() || 'ACTIVE',
            definition
          })
        });
      }, 'تم حفظ التقرير المخصص');
      await load();
    });

    setPageActions({ onRefresh: () => load(), onSave: () => document.getElementById('custom-report-form')?.requestSubmit() });
  };

  await load();
}

async function renderScheduledReports() {
  setTitle('تقارير مجدولة');
  const view = document.getElementById('view');

  const load = async () => {
    const rows = asArray((await request('/reports/schedules')).data);
    view.innerHTML = `
      <div class="card">
        <h3>إضافة جدولة جديدة</h3>
        <form id="schedule-form" class="grid-3">
          <div><label>اسم الجدولة</label><input id="sr-name" required /></div>
          <div><label>صيغة التكرار (CRON)</label><input id="sr-cron" placeholder="0 8 * * *" required /></div>
          <div><label>قناة الإرسال</label><input id="sr-channel" value="EMAIL" /></div>
          <div style="grid-column:1 / -1;"><label>المستلم</label><input id="sr-recipient" placeholder="finance@example.com" /></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الجدولة</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة التقارير المجدولة</h3>
        ${table(
          ['المعرف', 'الاسم', 'الجدولة', 'القناة', 'آخر تحديث'],
          rows.map((r) => [r.id, r.name || '-', r.cron || r.schedule || '-', r.channel || '-', r.updatedAt ? formatDate(r.updatedAt) : '-'])
        )}
      </div>
    `;

    document.getElementById('schedule-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await withToast(
        () =>
          request('/reports/schedules', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('sr-name').value.trim(),
              cron: document.getElementById('sr-cron').value.trim(),
              channel: document.getElementById('sr-channel').value.trim() || 'EMAIL',
              recipient: document.getElementById('sr-recipient').value.trim() || undefined
            })
          }),
        'تم حفظ الجدولة بنجاح'
      );
      await load();
    });

    setPageActions({ onRefresh: () => load(), onSave: () => document.getElementById('schedule-form')?.requestSubmit() });
  };

  await load();
}

async function renderAbcAnalysis() {
  setTitle('تحليل ABC');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تحليل ABC...</div>';

  const load = async () => {
    const data = (await request('/analytics/abc')).data || {};
    const rows = asArray(data.rows);
    const totalValue = Math.max(asNumber(data.totalValue), 1);
    let cumulative = 0;

    const mappedRows = rows.map((row) => {
      const value = asNumber(row.inventoryValue);
      const share = (value / totalValue) * 100;
      cumulative += share;
      const klass = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
      return { ...row, value, share, klass };
    });

    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الأصناف</div><div class="val">${asNumber(data.totalItems)}</div></div>
        <div class="kpi"><div>القيمة الإجمالية</div><div class="val">${formatMoney(data.totalValue)}</div></div>
        <div class="kpi"><div>أصناف الفئة A</div><div class="val">${asNumber(data.classAItems)}</div></div>
        <div class="kpi"><div>نسبة الفئة A</div><div class="val">${asNumber(data.classAPercentage).toFixed(2)}%</div></div>
      </div>
      <div class="card">
        ${table(
          ['الكود', 'الصنف', 'قيمة المخزون', 'نسبة المساهمة', 'التصنيف'],
          mappedRows.map((r) => [r.code || '-', r.nameAr || '-', formatMoney(r.value), `${r.share.toFixed(2)}%`, r.klass])
        )}
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderCustomerLifetimeValue() {
  setTitle('قيمة العميل الدائمة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تقرير قيمة العميل الدائمة...</div>';

  const load = async () => {
    const rows = asArray((await request('/analytics/clv')).data);
    const totalClv = rows.reduce((sum, row) => sum + asNumber(row.estimatedClv), 0);

    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>عدد العملاء</div><div class="val">${rows.length}</div></div>
        <div class="kpi"><div>إجمالي CLV التقديري</div><div class="val">${formatMoney(totalClv)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['الكود', 'اسم العميل', 'الرصيد الحالي', 'CLV التقديري'],
          rows.map((r) => [r.code || '-', r.nameAr || '-', formatMoney(r.currentBalance), formatMoney(r.estimatedClv)])
        )}
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderSalesForecast() {
  setTitle('تنبؤ المبيعات');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تنبؤ المبيعات...</div>';

  const load = async () => {
    const data = (await request('/analytics/sales-forecast')).data || {};
    const history = asArray(data.history);
    const diagnostics = data.diagnostics || {};
    const forecastRange = data.forecastRange || {};
    const trendLabel =
      diagnostics.trendDirection === 'up'
        ? 'صاعد'
        : diagnostics.trendDirection === 'down'
          ? 'هابط'
          : 'مستقر';

    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>نموذج التنبؤ</div><div class="val">${data.modelLabel || data.model || '-'}</div></div>
        <div class="kpi"><div>القيمة المتوقعة للشهر القادم</div><div class="val">${formatMoney(data.forecastNextMonth)}</div></div>
        <div class="kpi"><div>الفترة المستهدفة</div><div class="val">${data.nextPeriod || '-'}</div></div>
        <div class="kpi"><div>درجة الثقة</div><div class="val">${asNumber(data.confidenceScore).toFixed(0)}%</div></div>
      </div>
      <div class="card">
        <div class="grid-3">
          <div class="kpi"><div>نطاق التوقع</div><div class="val">${formatMoney(forecastRange.low)} - ${formatMoney(forecastRange.high)}</div></div>
          <div class="kpi"><div>عدد الأشهر التاريخية</div><div class="val">${asNumber(diagnostics.historyMonths || history.length)}</div></div>
          <div class="kpi"><div>الاتجاه العام</div><div class="val">${trendLabel}</div></div>
          <div class="kpi"><div>الأشهر المستخدمة للتدريب</div><div class="val">${asNumber(diagnostics.trainingMonths)}</div></div>
          <div class="kpi"><div>أشهر التحقق</div><div class="val">${asNumber(diagnostics.validationMonths)}</div></div>
          <div class="kpi"><div>متوسط المبيعات الشهرية</div><div class="val">${formatMoney(diagnostics.averageMonthlySales)}</div></div>
        </div>
        <p class="muted" style="margin-top:12px;">${data.insightAr || 'يعرض هذا التقرير تنبؤ الشهر القادم اعتماداً على سجل فواتير المبيعات داخل النظام.'}</p>
      </div>
      <div class="card">
        ${table(
          ['الفترة', 'المبيعات الفعلية', 'تقدير النموذج', 'الانحراف'],
          history.map((r) => [
            r.period || '-',
            formatMoney(r.amount),
            formatMoney(r.fittedAmount),
            `${formatMoney(r.deviation)} (${asNumber(r.deviationPct).toFixed(1)}%)`
          ])
        )}
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderBalancedScorecard() {
  setTitle('بطاقة الأداء المتوازن');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل بطاقة الأداء المتوازن...</div>';

  const load = async () => {
    const data = (await request('/analytics/bsc')).data || {};
    const rows = [
      { perspective: 'المالي', ...data.financial },
      { perspective: 'العملاء', ...data.customers },
      { perspective: 'العمليات الداخلية', ...data.internal },
      { perspective: 'التعلم والنمو', ...data.learning }
    ];

    view.innerHTML = `
      <div class="card">
        ${table(
          ['المنظور', 'المستهدف', 'الفعلي', 'الفجوة', 'الحالة'],
          rows.map((row) => {
            const target = asNumber(row.target);
            const actual = asNumber(row.actual);
            const gap = actual - target;
            return [
              row.perspective,
              `${target.toFixed(2)}%`,
              `${actual.toFixed(2)}%`,
              `${gap.toFixed(2)}%`,
              gap >= 0 ? 'ضمن المستهدف' : 'أقل من المستهدف'
            ];
          })
        )}
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}
