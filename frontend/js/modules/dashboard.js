import { request } from '../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge } from '../core/ui.js';

let dashboardTimer = null;
let hashListenerBound = false;

function stopAutoRefresh() {
  if (!dashboardTimer) return;
  clearInterval(dashboardTimer);
  dashboardTimer = null;
}

function setAutoRefresh(render) {
  stopAutoRefresh();
  dashboardTimer = setInterval(() => {
    render().catch(() => {
      // keep silent for background refresh failures
    });
  }, 5 * 60 * 1000);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clampText(value, max = 90) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatPeriod(period) {
  const text = String(period || '');
  if (!/^\d{4}-\d{2}$/.test(text)) return text || '-';
  const [year, month] = text.split('-');
  return `${month}/${year}`;
}

function formatAmountCompact(value) {
  const amount = toNumber(value);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}م`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}ألف`;
  return amount.toFixed(0);
}

function buildLinePath(points) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

function buildAreaPath(points, baselineY) {
  if (!points.length) return '';
  const path = [`M${points[0].x} ${baselineY}`];
  points.forEach((point) => path.push(`L${point.x} ${point.y}`));
  path.push(`L${points.at(-1).x} ${baselineY}`);
  path.push('Z');
  return path.join(' ');
}

function buildChartHtml(salesSeries, expenseSeries) {
  const allLabels = new Set();
  toArray(salesSeries).forEach((item) => allLabels.add(String(item.period || '')));
  toArray(expenseSeries).forEach((item) => allLabels.add(String(item.period || '')));

  const labels = Array.from(allLabels).filter(Boolean).sort();
  if (!labels.length) {
    return '<div class="dash-empty-chart">لا توجد بيانات كافية لعرض الرسم البياني.</div>';
  }

  const salesMap = new Map(toArray(salesSeries).map((item) => [String(item.period), toNumber(item.amount)]));
  const expenseMap = new Map(toArray(expenseSeries).map((item) => [String(item.period), toNumber(item.amount)]));

  const salesValues = labels.map((label) => salesMap.get(label) ?? 0);
  const expenseValues = labels.map((label) => expenseMap.get(label) ?? 0);
  const allValues = [...salesValues, ...expenseValues];
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(maxValue - minValue, 1);

  const width = 860;
  const height = 260;
  const left = 58;
  const right = 16;
  const top = 16;
  const bottom = 42;
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const step = labels.length > 1 ? usableWidth / (labels.length - 1) : 0;
  const baselineY = top + usableHeight;

  const toY = (value) => top + usableHeight - ((value - minValue) / range) * usableHeight;
  const toX = (index) => left + step * index;

  const salesPoints = salesValues.map((value, index) => ({ x: toX(index), y: toY(value), value }));
  const expensePoints = expenseValues.map((value, index) => ({ x: toX(index), y: toY(value), value }));

  const xTicks = labels
    .map((label, index) => ({ label: formatPeriod(label), index }))
    .filter((_, index) => index === 0 || index === labels.length - 1 || index % Math.ceil(labels.length / 6) === 0);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue - (maxValue - minValue) * ratio;
    const y = top + usableHeight * ratio;
    return { value, y };
  });

  return `
    <div class="dash-chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="dash-chart-svg" role="img" aria-label="مبيعات ومصروفات">
        <defs>
          <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="rgba(15, 109, 93, 0.34)"></stop>
            <stop offset="100%" stop-color="rgba(15, 109, 93, 0.04)"></stop>
          </linearGradient>
        </defs>

        ${yTicks.map((tick) => `
          <line x1="${left}" y1="${tick.y}" x2="${width - right}" y2="${tick.y}" class="dash-grid-line"></line>
          <text x="${left - 8}" y="${tick.y + 4}" class="dash-axis-label" text-anchor="end">${formatAmountCompact(tick.value)}</text>
        `).join('')}

        <path d="${buildAreaPath(salesPoints, baselineY)}" class="dash-area-sales"></path>
        <path d="${buildLinePath(salesPoints)}" class="dash-line-sales"></path>
        <path d="${buildLinePath(expensePoints)}" class="dash-line-expenses"></path>

        ${salesPoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="dash-dot-sales"></circle>`).join('')}
        ${expensePoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="dash-dot-expenses"></circle>`).join('')}

        ${xTicks.map((tick) => `
          <text x="${toX(tick.index)}" y="${height - 12}" class="dash-axis-label" text-anchor="middle">${tick.label}</text>
        `).join('')}
      </svg>

      <div class="dash-legend">
        <span><i class="dash-legend-dot sales"></i> المبيعات</span>
        <span><i class="dash-legend-dot expenses"></i> المصروفات</span>
      </div>
    </div>
  `;
}

function buildMonthlyBarsHtml(salesSeries, expenseSeries) {
  const allLabels = new Set();
  toArray(salesSeries).forEach((item) => allLabels.add(String(item.period || '')));
  toArray(expenseSeries).forEach((item) => allLabels.add(String(item.period || '')));
  const labels = Array.from(allLabels).filter(Boolean).sort();

  if (!labels.length) {
    return '<div class="dash-empty-chart">لا توجد بيانات شهرية كافية.</div>';
  }

  const salesMap = new Map(toArray(salesSeries).map((item) => [String(item.period), toNumber(item.amount)]));
  const expenseMap = new Map(toArray(expenseSeries).map((item) => [String(item.period), toNumber(item.amount)]));
  const maxValue = Math.max(
    1,
    ...labels.map((label) => Math.max(salesMap.get(label) ?? 0, expenseMap.get(label) ?? 0))
  );

  return `
    <div class="dash-bars">
      ${labels
        .map((label) => {
          const sales = salesMap.get(label) ?? 0;
          const expenses = expenseMap.get(label) ?? 0;
          const salesWidth = Math.max(6, (sales / maxValue) * 100);
          const expenseWidth = Math.max(6, (expenses / maxValue) * 100);
          return `
            <div class="dash-bar-row">
              <div class="dash-bar-header">
                <strong>${formatPeriod(label)}</strong>
                <span>${formatMoney(sales + expenses)}</span>
              </div>
              <div class="dash-bar-track">
                <div class="dash-bar-fill sales" style="width:${salesWidth}%">
                  <span>${formatAmountCompact(sales)}</span>
                </div>
              </div>
              <div class="dash-bar-track">
                <div class="dash-bar-fill expenses" style="width:${expenseWidth}%">
                  <span>${formatAmountCompact(expenses)}</span>
                </div>
              </div>
            </div>
          `;
        })
        .join('')}
      <div class="dash-legend">
        <span><i class="dash-legend-dot sales"></i> مبيعات</span>
        <span><i class="dash-legend-dot expenses"></i> مصروفات</span>
      </div>
    </div>
  `;
}

function buildOperationalDistributionHtml(kpis = {}, pending = {}) {
  const tasksCount = toArray(pending.tasks).length;
  const ticketsCount = toArray(pending.tickets).length;
  const leavesCount = toArray(pending.leaves).length;
  const slices = [
    { label: 'فواتير معلقة', value: toNumber(kpis.pendingInvoices), tone: 'tone-a' },
    { label: 'مدفوعات معلقة', value: toNumber(kpis.pendingPayments), tone: 'tone-b' },
    { label: 'قيود مسودة', value: toNumber(kpis.draftEntries), tone: 'tone-c' },
    { label: 'مهام مفتوحة', value: toNumber(kpis.openTasks) + tasksCount, tone: 'tone-d' },
    { label: 'تذاكر دعم', value: ticketsCount, tone: 'tone-e' },
    { label: 'طلبات إجازة', value: leavesCount, tone: 'tone-f' }
  ];

  const maxValue = Math.max(1, ...slices.map((slice) => slice.value));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return `
    <div class="dash-distribution">
      ${slices
        .map((slice) => {
          const width = Math.max(4, (slice.value / maxValue) * 100);
          const percent = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
          return `
            <div class="dash-dist-row">
              <div class="dash-dist-head">
                <span>${slice.label}</span>
                <strong>${slice.value} (${percent}%)</strong>
              </div>
              <div class="dash-dist-track">
                <div class="dash-dist-fill ${slice.tone}" style="width:${width}%"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderRecentJournals(journals) {
  const rows = toArray(journals).slice(0, 5);
  if (!rows.length) return '<li class="dash-empty-row">لا توجد قيود حديثة.</li>';

  return rows
    .map(
      (item) => `
        <li class="dash-list-row">
          <div>
            <strong>${item.entryNumber || '-'}</strong>
            <p>${clampText(item.description)}</p>
          </div>
          <div class="dash-list-meta">
            <span>${formatDate(item.date)}</span>
            ${statusBadge(item.status)}
          </div>
        </li>
      `
    )
    .join('');
}

function renderRecentInvoices(invoices) {
  const rows = toArray(invoices).slice(0, 5);
  if (!rows.length) return '<li class="dash-empty-row">لا توجد فواتير حديثة.</li>';

  return rows
    .map((item) => {
      const partyId = item.customerId || item.supplierId || '-';
      const amount = toNumber(item.total || item.outstanding);
      return `
        <li class="dash-list-row">
          <div>
            <strong>${item.number || '-'}</strong>
            <p>طرف: ${partyId} | نوع: ${item.type || '-'}</p>
          </div>
          <div class="dash-list-meta">
            <span>${formatMoney(amount)}</span>
            ${statusBadge(item.status)}
          </div>
        </li>
      `;
    })
    .join('');
}

function renderPendingItems(items, emptyText, route) {
  const rows = toArray(items).slice(0, 5);
  if (!rows.length) return `<li class="dash-empty-row">${emptyText}</li>`;

  return rows
    .map(
      (item) => `
        <li class="dash-list-row clickable" data-nav="${route}">
          <div>
            <strong>${item.subject || item.title || item.number || item.type || 'عنصر'}</strong>
            <p>${clampText(item.description || item.reason || `الحالة: ${item.status || '-'}`)}</p>
          </div>
          <div class="dash-list-meta">
            <span>${formatDate(item.createdAt || item.startDate)}</span>
            ${statusBadge(item.status || 'PENDING')}
          </div>
        </li>
      `
    )
    .join('');
}

function bindNavigationTargets(view) {
  view.querySelectorAll('[data-nav]').forEach((element) => {
    element.addEventListener('click', () => {
      const path = element.getAttribute('data-nav');
      if (!path) return;
      location.hash = path;
    });
  });
}

export async function renderDashboard() {
  setTitle('لوحة التحكم');
  setPageActions({ onRefresh: () => renderDashboard() });
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل لوحة التحليلات...</div>';

  const load = async () => {
    const [kpiRes, salesRes, expenseRes, recentRes, pendingRes] = await Promise.all([
      request('/dashboard/kpi'),
      request('/dashboard/charts/sales'),
      request('/dashboard/charts/expenses'),
      request('/dashboard/recent-transactions'),
      request('/dashboard/pending-tasks')
    ]);

    const kpis = kpiRes?.data || {};
    const salesSeries = toArray(salesRes?.data);
    const expenseSeries = toArray(expenseRes?.data);
    const recent = recentRes?.data || {};
    const pending = pendingRes?.data || {};

    const salesTotal = salesSeries.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const expenseTotal = expenseSeries.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const netResult = salesTotal - expenseTotal;

    view.innerHTML = `
      <section class="dash-hero card">
        <div>
          <p class="dash-overline">نظرة عامة تشغيلية</p>
          <h3>لوحة تحليلات الأداء المالي والتشغيلي</h3>
          <p class="muted">ملخص فوري لحالة المبيعات والمصروفات والعمليات المعلقة.</p>
        </div>
        <div class="dash-hero-metrics">
          <div class="dash-hero-metric">
            <span>إجمالي المبيعات</span>
            <strong>${formatMoney(salesTotal)}</strong>
          </div>
          <div class="dash-hero-metric">
            <span>إجمالي المصروفات</span>
            <strong>${formatMoney(expenseTotal)}</strong>
          </div>
          <div class="dash-hero-metric ${netResult >= 0 ? 'positive' : 'negative'}">
            <span>صافي النتيجة</span>
            <strong>${formatMoney(netResult)}</strong>
          </div>
        </div>
      </section>

      <section class="dash-kpi-grid">
        <article class="dash-kpi-card clickable" data-nav="#/sales-invoices">
          <p>فواتير معلقة</p>
          <strong>${toNumber(kpis.pendingInvoices)}</strong>
        </article>
        <article class="dash-kpi-card clickable" data-nav="#/payment-vouchers">
          <p>مدفوعات معلقة</p>
          <strong>${toNumber(kpis.pendingPayments)}</strong>
        </article>
        <article class="dash-kpi-card clickable" data-nav="#/journals">
          <p>قيود مسودة</p>
          <strong>${toNumber(kpis.draftEntries)}</strong>
        </article>
        <article class="dash-kpi-card clickable" data-nav="#/assets">
          <p>أصول نشطة</p>
          <strong>${toNumber(kpis.activeAssets)}</strong>
        </article>
        <article class="dash-kpi-card clickable" data-nav="#/tasks">
          <p>مهام مفتوحة</p>
          <strong>${toNumber(kpis.openTasks)}</strong>
        </article>
      </section>

      <section class="dash-main-grid">
        <article class="card dash-chart-card">
          <div class="section-title">
            <h3>اتجاه المبيعات مقابل المصروفات</h3>
            <span class="muted">آخر الفترات المتاحة</span>
          </div>
          ${buildChartHtml(salesSeries, expenseSeries)}
        </article>

        <article class="card dash-summary-card">
          <h3>ملخص تنفيذي سريع</h3>
          <ul class="dash-summary-list">
            <li>
              <span>الفارق بين المبيعات والمصروفات</span>
              <strong class="${netResult >= 0 ? 'success' : 'error'}">${formatMoney(netResult)}</strong>
            </li>
            <li>
              <span>متوسط المبيعات للفترة</span>
              <strong>${formatMoney(salesSeries.length ? salesTotal / salesSeries.length : 0)}</strong>
            </li>
            <li>
              <span>متوسط المصروفات للفترة</span>
              <strong>${formatMoney(expenseSeries.length ? expenseTotal / expenseSeries.length : 0)}</strong>
            </li>
            <li>
              <span>مستوى الانشغال التشغيلي</span>
              <strong>${toNumber(kpis.pendingInvoices) + toNumber(kpis.pendingPayments) + toNumber(kpis.openTasks)}</strong>
            </li>
          </ul>
          <div class="dash-summary-note">
            يفضّل مراجعة البنود المعلقة يومياً لتقليل مخاطر التأخير في التحصيل والتنفيذ.
          </div>
        </article>
      </section>

      <section class="dash-main-grid dash-main-grid-equal">
        <article class="card">
          <div class="section-title">
            <h3>مقارنة شهرية تفصيلية</h3>
            <span class="muted">مبيعات ومصروفات لكل فترة</span>
          </div>
          ${buildMonthlyBarsHtml(salesSeries, expenseSeries)}
        </article>
        <article class="card">
          <div class="section-title">
            <h3>توزيع الأحمال التشغيلية</h3>
            <span class="muted">حجم الأعمال المعلقة حسب النوع</span>
          </div>
          ${buildOperationalDistributionHtml(kpis, pending)}
        </article>
      </section>

      <section class="dash-main-grid">
        <article class="card">
          <div class="section-title">
            <h3>آخر المعاملات</h3>
            <a href="#/journals" class="muted">الذهاب إلى القيود</a>
          </div>
          <div class="dash-split-list">
            <div>
              <h4>القيود</h4>
              <ul class="panel-list">${renderRecentJournals(recent.journals)}</ul>
            </div>
            <div>
              <h4>الفواتير</h4>
              <ul class="panel-list">${renderRecentInvoices(recent.invoices)}</ul>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="section-title">
            <h3>قائمة المتابعة</h3>
            <a href="#/tasks" class="muted">كل المهام</a>
          </div>
          <div class="dash-pending-blocks">
            <div>
              <h4>المهام</h4>
              <ul class="panel-list">${renderPendingItems(pending.tasks, 'لا توجد مهام معلقة.', '#/tasks')}</ul>
            </div>
            <div>
              <h4>تذاكر الدعم</h4>
              <ul class="panel-list">${renderPendingItems(pending.tickets, 'لا توجد تذاكر مفتوحة.', '#/support-tickets')}</ul>
            </div>
            <div>
              <h4>طلبات الإجازة</h4>
              <ul class="panel-list">${renderPendingItems(pending.leaves, 'لا توجد طلبات إجازة قيد الانتظار.', '#/leave-requests')}</ul>
            </div>
          </div>
        </article>
      </section>
    `;

    bindNavigationTargets(view);
  };

  try {
    await load();
    setAutoRefresh(load);
  } catch (error) {
    stopAutoRefresh();
    view.innerHTML = `
      <div class="card">
        <h3>تعذر تحميل لوحة التحكم</h3>
        <p class="error">${error.message || 'حدث خطأ غير متوقع.'}</p>
        <button id="dashboard-retry" class="btn btn-primary">إعادة المحاولة</button>
      </div>
    `;
    document.getElementById('dashboard-retry')?.addEventListener('click', () => renderDashboard());
  }

  if (!hashListenerBound) {
    hashListenerBound = true;
    window.addEventListener('hashchange', () => {
      if (!location.hash.startsWith('#/dashboard')) stopAutoRefresh();
    });
  }
}
