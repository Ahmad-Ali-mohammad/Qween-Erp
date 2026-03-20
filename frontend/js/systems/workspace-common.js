import { extractRows, request } from '../core/api.js';
import { formatDate, formatNumber } from '../core/ui.js';

export function renderHeroCards(summary) {
  return summary
    .slice(0, 4)
    .map(
      (item) => `
        <div class="kpi">
          <div>${item.label}</div>
          <div class="val">${typeof item.value === 'string' ? item.value : formatNumber(item.value)}</div>
        </div>
      `
    )
    .join('');
}

export function renderChartBlocks(charts) {
  return `
    <div class="system-chart-grid">
      ${charts
        .map((chart) => {
          const maxValue = Math.max(1, ...chart.series.map((row) => Number(row.value || 0)));
          return `
            <article class="system-chart-card chart-${chart.kind}">
              <div class="system-section-head">
                <h3>${chart.title}</h3>
                <span>${chart.kind === 'donut' ? 'توزيع' : 'اتجاه'}</span>
              </div>
              <div class="system-chart-series">
                ${chart.series
                  .map(
                    (row) => `
                      <div class="system-chart-row">
                        <div class="system-chart-head">
                          <span>${row.label}</span>
                          <strong>${formatNumber(row.value)}</strong>
                        </div>
                        <div class="system-chart-track">
                          <div class="system-chart-fill" style="width:${Math.max(8, (Number(row.value || 0) / maxValue) * 100)}%"></div>
                        </div>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

export function renderAlertStack(alerts) {
  return alerts
    .map(
      (item) => `
        <article class="system-alert severity-${item.severity}">
          <div>
            <p class="system-alert-title">${item.title}</p>
            <p class="system-alert-body">${item.message}</p>
          </div>
        </article>
      `
    )
    .join('');
}

export function renderQueueList(queues, fallbackRoute) {
  return queues
    .map(
      (item) => `
        <button class="system-queue-item" type="button" data-nav="${item.route || fallbackRoute}">
          <span>${item.label}</span>
          <strong>${formatNumber(item.count)}</strong>
        </button>
      `
    )
    .join('');
}

export async function safeRows(path) {
  try {
    return extractRows(await request(path));
  } catch {
    return [];
  }
}

export function toDateInput(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function renderActivityTable(table, activity, statusBadge) {
  return table(
    ['العنصر', 'الوصف', 'التاريخ', 'الحالة'],
    activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), statusBadge(item.status)])
  );
}
