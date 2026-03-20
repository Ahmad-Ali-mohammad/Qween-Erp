import { extractRows, request, toQuery } from '../core/api.js';
import { formatDate, formatMoney, formatNumber, setPageActions, setTitle, statusBadge } from '../core/ui.js';
import { createSystemsRegistry, findSystemByKey, systemsGroupMeta } from './registry.js';

const systemsCatalog = createSystemsRegistry();

function toneClass(tone) {
  return tone ? `tone-${tone}` : '';
}

function severityLabel(severity) {
  return {
    info: 'معلومة',
    success: 'مستقر',
    warning: 'تنبيه',
    danger: 'حرج'
  }[severity] || 'تنبيه';
}

function formatValue(item, system) {
  if (typeof item?.value === 'string') return item.value;
  if (system?.moneyKeys?.includes(item.key)) return formatMoney(item.value);
  return formatNumber(item.value);
}

function buildChartSeries(chart) {
  const rows = Array.isArray(chart?.series) ? chart.series : [];
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  return rows
    .map((row) => {
      const value = Number(row.value || 0);
      const width = Math.max(8, (value / maxValue) * 100);
      return `
        <div class="system-chart-row">
          <div class="system-chart-head">
            <span>${row.label}</span>
            <strong>${formatNumber(value)}</strong>
          </div>
          <div class="system-chart-track">
            <div class="system-chart-fill" style="width:${width}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderSummary(summary, system) {
  return `
    <section class="system-card system-summary-grid" data-section="summary">
      ${summary
        .map(
          (item) => `
            <article class="system-metric ${toneClass(item.tone)}" ${item.route ? `data-nav="${item.route}"` : ''}>
              <span>${item.label}</span>
              <strong>${formatValue(item, system)}</strong>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function renderQueues(queues) {
  return `
    <section class="system-card" data-section="queues">
      <div class="system-section-head">
        <h3>قوائم العمل</h3>
        <span>الاعتمادات والطوابير المباشرة</span>
      </div>
      <div class="system-queue-list">
        ${queues
          .map(
            (item) => `
              <button class="system-queue-item ${toneClass(item.tone)}" type="button" ${item.route ? `data-nav="${item.route}"` : ''}>
                <span>${item.label}</span>
                <strong>${formatNumber(item.count)}</strong>
              </button>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderAlerts(alerts) {
  return `
    <section class="system-card" data-section="alerts">
      <div class="system-section-head">
        <h3>الاستثناءات والتنبيهات</h3>
        <span>الحالات التي تستحق متابعة الآن</span>
      </div>
      <div class="system-alert-stack">
        ${alerts
          .map(
            (item) => `
              <article class="system-alert severity-${item.severity}" ${item.route ? `data-nav="${item.route}"` : ''}>
                <div>
                  <p class="system-alert-title">${item.title}</p>
                  <p class="system-alert-body">${item.message}</p>
                </div>
                <span class="system-alert-badge">${severityLabel(item.severity)}</span>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderActivity(activity) {
  return `
    <section class="system-card" data-section="activity">
      <div class="system-section-head">
        <h3>النشاط الأخير</h3>
        <span>آخر السجلات والتغيرات</span>
      </div>
      <div class="system-activity-list">
        ${activity
          .map(
            (item) => `
              <article class="system-activity-item" ${item.route ? `data-nav="${item.route}"` : ''}>
                <div>
                  <strong>${item.title}</strong>
                  <p>${item.subtitle || 'بدون وصف إضافي'}</p>
                </div>
                <div class="system-activity-meta">
                  ${item.date ? `<span>${formatDate(item.date)}</span>` : ''}
                  ${item.status ? statusBadge(item.status) : ''}
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderCharts(charts) {
  return `
    <section class="system-card system-chart-grid" data-section="charts">
      ${charts
        .map(
          (chart) => `
            <article class="system-chart-card chart-${chart.kind}">
              <div class="system-section-head">
                <h3>${chart.title}</h3>
                <span>${chart.kind === 'donut' ? 'توزيع' : chart.kind === 'line' ? 'اتجاه' : 'مقارنة'}</span>
              </div>
              <div class="system-chart-series">
                ${buildChartSeries(chart)}
              </div>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function renderHero(system) {
  return `
    <section class="system-card system-hero">
      <div>
        <p class="system-overline">${system.title}</p>
        <h2>${system.summary}</h2>
        <p class="system-hero-copy">لوحة مستقلة لهذا النظام ضمن البوابة الموحدة، مع نفس عقود الـAPI القياسية وعمق عرض مختلف بحسب المجال.</p>
      </div>
      <div class="system-hero-actions">
        ${system.quickActions
          .map(
            (action) => `
              <a href="#${action.path}" class="system-action-link">
                <span>${action.label}</span>
              </a>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function maturityLabel(maturity) {
  return maturity === 'real' ? 'مربوط' : 'قيد الإكمال';
}

function renderSystemsHub() {
  const cardsByGroup = Object.entries(systemsGroupMeta)
    .map(([group, meta]) => {
      const systems = systemsCatalog.filter((system) => system.group === group && system.key !== 'control-center');
      if (!systems.length) return '';

      return `
        <section class="system-hub-group">
          <div class="system-section-head">
            <h3>${meta.title}</h3>
            <span>${meta.description}</span>
          </div>
          <div class="system-hub-grid">
            ${systems
              .map(
                (system) => `
                  <article class="system-hub-card maturity-${system.maturity} theme-${system.theme}">
                    <div class="system-hub-head">
                      <div>
                        <p class="system-hub-kicker">${meta.kicker}</p>
                        <h4>${system.title}</h4>
                      </div>
                      <span class="system-hub-badge">${maturityLabel(system.maturity)}</span>
                    </div>
                    <p class="system-hub-summary">${system.summary}</p>
                    <div class="system-hub-links">
                      <a href="#${system.route}" class="system-action-link">لوحة النظام</a>
                      ${system.quickActions
                        .slice(0, 2)
                        .map((action) => `<a href="#${action.path}" class="system-action-link subtle">${action.label}</a>`)
                        .join('')}
                    </div>
                  </article>
                `
              )
              .join('')}
          </div>
        </section>
      `;
    })
    .filter(Boolean)
    .join('');

  return `
    <section class="system-card system-hub-panel" data-section="systems">
      <div class="system-section-head">
        <h3>دليل الأنظمة</h3>
        <span>ابدأ من هنا وافتح كل نظام عبر لوحة مستقلة داخل البوابة الموحدة.</span>
      </div>
      ${cardsByGroup}
    </section>
  `;
}

function bindNavigationTargets(view) {
  view.querySelectorAll('[data-nav]').forEach((element) => {
    element.addEventListener('click', () => {
      const path = element.getAttribute('data-nav');
      if (path) location.hash = path;
    });
  });
}

function normalizeSection(sectionName, markup) {
  return `<div class="system-layout-slot" data-slot="${sectionName}">${markup}</div>`;
}

export async function renderSystemDashboard(key) {
  const system = findSystemByKey(key);
  if (!system) {
    throw new Error(`Unknown system dashboard: ${key}`);
  }

  setTitle(system.title);
  setPageActions({ onRefresh: () => renderSystemDashboard(key) });

  const view = document.getElementById('view');
  view.innerHTML = `<div class="system-card">جاري تحميل لوحة ${system.title}...</div>`;

  const prefix = `/api/${system.namespace}/dashboard`;
  const query = toQuery({});

  try {
    const [summaryPayload, queuesPayload, activityPayload, alertsPayload, chartsPayload] = await Promise.all([
      request(`${prefix}/summary${query}`),
      request(`${prefix}/queues${query}`),
      request(`${prefix}/activity${query}`),
      request(`${prefix}/alerts${query}`),
      request(`${prefix}/charts${query}`)
    ]);

    const sections = {
      hero: renderHero(system),
      systems: key === 'control-center' ? renderSystemsHub() : '',
      summary: renderSummary(extractRows(summaryPayload), system),
      queues: renderQueues(extractRows(queuesPayload)),
      activity: renderActivity(extractRows(activityPayload)),
      alerts: renderAlerts(extractRows(alertsPayload)),
      charts: renderCharts(extractRows(chartsPayload))
    };

    view.innerHTML = `
      <div class="system-dashboard theme-${system.theme}" data-system-key="${system.key}">
        ${system.layout.map((sectionName) => normalizeSection(sectionName, sections[sectionName])).join('')}
      </div>
    `;

    bindNavigationTargets(view);
  } catch (error) {
    view.innerHTML = `
      <section class="system-card system-error-state">
        <h3>تعذر تحميل لوحة ${system.title}</h3>
        <p class="error">${error.message || 'حدث خطأ غير متوقع.'}</p>
        <button id="retry-system-dashboard" class="btn btn-primary">إعادة المحاولة</button>
      </section>
    `;
    document.getElementById('retry-system-dashboard')?.addEventListener('click', () => renderSystemDashboard(key));
  }
}
