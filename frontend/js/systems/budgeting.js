import { extractMeta, extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatMoney, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';

function renderHeroCards(summary) {
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

function renderChartBlocks(charts) {
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

function renderAlertStack(alerts) {
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

function renderQueueList(queues) {
  return queues
    .map(
      (item) => `
        <button class="system-queue-item" type="button" data-nav="${item.route || '/systems/budgeting'}">
          <span>${item.label}</span>
          <strong>${formatNumber(item.count)}</strong>
        </button>
      `
    )
    .join('');
}

function routeForMode(mode) {
  if (mode === 'variance') return '/systems/budgeting/variance';
  if (mode === 'forecast') return '/systems/budgeting/forecast';
  return '/systems/budgeting/scenarios';
}

function toDateInput(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

async function safeRows(path) {
  try {
    return extractRows(await request(path));
  } catch {
    return [];
  }
}

function optionLabel(row, fallbackKeys = ['nameAr', 'fullName', 'title', 'number', 'code']) {
  const found = fallbackKeys.map((key) => row?.[key]).find((value) => value);
  return escapeHtml(String(found || row?.id || '-'));
}

function tableOrEmpty(headers, rows, emptyLabel = 'لا توجد بيانات حتى الآن') {
  if (!rows.length) {
    return `<div class="empty-state muted">${emptyLabel}</div>`;
  }
  return table(headers, rows);
}

export async function renderBudgetingWorkspace(mode = 'scenarios') {
  const modeTitles = {
    scenarios: 'الموازنات والتخطيط - السيناريوهات',
    variance: 'الموازنات والتخطيط - الانحراف',
    forecast: 'الموازنات والتخطيط - التوقعات'
  };

  setTitle(modeTitles[mode] || modeTitles.scenarios);
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام الموازنات والتخطيط...</div>';

  const state = {
    selectedScenarioId: '',
    selectedVersionId: '',
    varianceSeverity: '',
    varianceProjectId: '',
    forecastVersionId: ''
  };

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, scenariosRes, versionsRes, branches, projects, accounts, legacyBudgets, contracts] =
      await Promise.all([
        request('/budgeting/dashboard/summary'),
        request('/budgeting/dashboard/queues'),
        request('/budgeting/dashboard/alerts'),
        request('/budgeting/dashboard/activity'),
        request('/budgeting/dashboard/charts'),
        request('/budgeting/scenarios?page=1&limit=100'),
        request('/budgeting/versions?page=1&limit=100'),
        safeRows('/platform/branches'),
        safeRows('/projects?page=1&limit=200'),
        safeRows('/accounts?page=1&limit=200'),
        safeRows('/budgets'),
        safeRows('/contracts?page=1&limit=200')
      ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const scenarios = extractRows(scenariosRes);
    const versions = extractRows(versionsRes);

    if (!state.selectedScenarioId && scenarios.length) {
      state.selectedScenarioId = String(scenarios[0].id);
    }
    const scenarioVersions = versions.filter((row) => String(row.scenarioId) === String(state.selectedScenarioId));
    if (!state.selectedVersionId && scenarioVersions.length) {
      state.selectedVersionId = String(scenarioVersions[0].id);
    }
    if (!state.forecastVersionId && versions.length) {
      state.forecastVersionId = String(versions[0].id);
    }

    const [allocationsRes, varianceRes, forecastRes] = await Promise.all([
      request(`/budgeting/allocations?page=1&limit=100${state.selectedVersionId ? `&versionId=${state.selectedVersionId}` : ''}`),
      request(
        `/budgeting/variance?page=1&limit=100${state.selectedVersionId ? `&versionId=${state.selectedVersionId}` : ''}${
          state.varianceSeverity ? `&severity=${state.varianceSeverity}` : ''
        }${state.varianceProjectId ? `&projectId=${state.varianceProjectId}` : ''}`
      ),
      request(`/budgeting/forecast?page=1&limit=100${state.forecastVersionId ? `&versionId=${state.forecastVersionId}` : ''}`)
    ]);

    const allocations = extractRows(allocationsRes);
    const variances = extractRows(varianceRes);
    const varianceMeta = extractMeta(varianceRes);
    const forecasts = extractRows(forecastRes);

    const branchOptions = branches
      .map((row) => `<option value="${row.id}">${optionLabel(row, ['nameAr', 'code'])}</option>`)
      .join('');
    const scenarioOptions = scenarios
      .map(
        (row) =>
          `<option value="${row.id}" ${String(row.id) === String(state.selectedScenarioId) ? 'selected' : ''}>${escapeHtml(`${row.code} - ${row.nameAr}`)}</option>`
      )
      .join('');
    const versionOptions = scenarioVersions
      .map(
        (row) =>
          `<option value="${row.id}" ${String(row.id) === String(state.selectedVersionId) ? 'selected' : ''}>${escapeHtml(
            `${row.label} (${row.status})`
          )}</option>`
      )
      .join('');
    const allVersionOptions = versions
      .map(
        (row) =>
          `<option value="${row.id}" ${String(row.id) === String(state.forecastVersionId) ? 'selected' : ''}>${escapeHtml(
            `${row.label} - ${row.scenario?.nameAr || row.scenario?.code || row.scenarioId}`
          )}</option>`
      )
      .join('');
    const projectOptions = projects.map((row) => `<option value="${row.id}">${optionLabel(row, ['nameAr', 'code'])}</option>`).join('');
    const accountOptions = accounts
      .filter((row) => row.allowPosting !== false)
      .map((row) => `<option value="${row.id}">${optionLabel(row, ['nameAr', 'code'])} (${escapeHtml(String(row.code || row.id))})</option>`)
      .join('');
    const contractOptions = contracts.map((row) => `<option value="${row.id}">${optionLabel(row, ['title', 'number'])}</option>`).join('');

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Budgeting</p>
          <h3>إدارة السيناريوهات والتخصيصات والانحراف والتوقعات من لوحة واحدة</h3>
          <p class="muted">النظام يعمل الآن عبر طبقة Budgeting القانونية الجديدة مع إبقاء طبقة التوافق القديمة فعالة للصفحات legacy حتى نهاية الترحيل.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>قوائم العمل</h3>
            <span class="muted">الاعتمادات والنسخ والانحرافات</span>
          </div>
          <div class="system-queue-list">${renderQueueList(queues)}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات الموازنة</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const baseSections = `
      <section class="card">
        <div class="section-title">
          <h3>المؤشرات والاتجاهات</h3>
          <span class="muted">مقارنة المخطط والفعلي وشدة الانحراف</span>
        </div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${tableOrEmpty(
          ['العنصر', 'الوصف', 'التاريخ', 'الحالة'],
          activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), statusBadge(item.status)])
        )}
      </section>
    `;

    if (mode === 'scenarios') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إنشاء سيناريو جديد</h3></div>
          <form id="budget-scenario-form" class="grid-3">
            <div><label>رمز السيناريو</label><input id="budget-scenario-code" required /></div>
            <div><label>اسم السيناريو</label><input id="budget-scenario-name" required /></div>
            <div><label>السنة المالية</label><input id="budget-scenario-year" type="number" value="${new Date().getFullYear()}" required /></div>
            <div><label>الفرع</label><select id="budget-scenario-branch-id"><option value="">افتراضي</option>${branchOptions}</select></div>
            <div><label>مستوى التحكم</label><select id="budget-scenario-control-level"><option value="NONE">NONE</option><option value="WARNING">WARNING</option><option value="HARD">HARD</option></select></div>
            <div><label>ملاحظات</label><input id="budget-scenario-notes" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ السيناريو</button></div>
          </form>
        </section>

        <section class="card">
          <div class="section-title"><h3>إنشاء إصدار وربطه بالسيناريو</h3></div>
          <form id="budget-version-form" class="grid-3">
            <div><label>السيناريو</label><select id="budget-version-scenario-id"><option value="">اختر السيناريو</option>${scenarioOptions}</select></div>
            <div><label>اسم الإصدار</label><input id="budget-version-label" placeholder="Baseline / Rev A" required /></div>
            <div><label>تاريخ النفاذ</label><input id="budget-version-effective-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>ملاحظات</label><input id="budget-version-notes" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-info" type="submit">إنشاء الإصدار</button></div>
          </form>
        </section>

        <section class="card">
          <div class="section-title"><h3>تحميل تخصيص على الإصدار</h3><span class="muted">الإدخال الحالي سريع ومباشر كسطر واحد، والـAPI تحفظه bulk داخليًا.</span></div>
          <form id="budget-allocation-form" class="grid-3">
            <div><label>الإصدار</label><select id="budget-allocation-version-id"><option value="">اختر الإصدار</option>${versionOptions}</select></div>
            <div><label>الحساب</label><select id="budget-allocation-account-id"><option value="">اختر الحساب</option>${accountOptions}</select></div>
            <div><label>الفترة</label><input id="budget-allocation-period" type="number" min="1" max="12" value="1" required /></div>
            <div><label>المخطط</label><input id="budget-allocation-planned" type="number" min="0" step="0.01" value="0" required /></div>
            <div><label>الفعلي</label><input id="budget-allocation-actual" type="number" min="0" step="0.01" value="0" /></div>
            <div><label>الملتزم</label><input id="budget-allocation-committed" type="number" min="0" step="0.01" value="0" /></div>
            <div><label>الفرع</label><select id="budget-allocation-branch-id"><option value="">من السيناريو</option>${branchOptions}</select></div>
            <div><label>المشروع</label><select id="budget-allocation-project-id"><option value="">اختياري</option>${projectOptions}</select></div>
            <div><label>العقد</label><select id="budget-allocation-contract-id"><option value="">اختياري</option>${contractOptions}</select></div>
            <div><label>مركز تكلفة</label><input id="budget-allocation-cost-center-id" type="number" min="1" placeholder="اختياري" /></div>
            <div><label>إدارة</label><input id="budget-allocation-department-id" type="number" min="1" placeholder="اختياري" /></div>
            <div><label>ملاحظة</label><input id="budget-allocation-note" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ التخصيص</button></div>
          </form>
        </section>

        <section class="card">
          <div class="section-title"><h3>دفتر السيناريوهات</h3></div>
          ${tableOrEmpty(
            ['الرمز', 'الاسم', 'الفرع', 'السنة', 'الحالة', 'الاعتماد', 'الإجراءات'],
            scenarios.map((row) => [
              row.code,
              row.nameAr,
              row.branch?.nameAr || '-',
              row.fiscalYear,
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.approvalStatus === 'DRAFT' || row.approvalStatus === 'REJECTED' ? `<button class="btn btn-info btn-sm" data-action="scenario-submit" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="scenario-approve" data-id="${row.id}">اعتماد</button>` : ''}
                <button class="btn btn-secondary btn-sm" data-action="scenario-select" data-id="${row.id}">اختيار</button>
              </div>`
            ]),
            'ابدأ بإنشاء أول سيناريو للموازنة.'
          )}
        </section>

        <section class="card">
          <div class="section-title"><h3>إصدارات السيناريو المحدد</h3></div>
          ${tableOrEmpty(
            ['الإصدار', 'السيناريو', 'المخطط', 'الفعلي', 'الانحراف', 'الحالة', 'الإجراءات'],
            scenarioVersions.map((row) => [
              row.label,
              row.scenario?.nameAr || row.scenario?.code || '-',
              formatMoney(row.plannedTotal || 0),
              formatMoney(row.actualTotal || 0),
              formatMoney(row.varianceTotal || 0),
              statusBadge(row.status),
              `<div class="actions">
                <button class="btn btn-secondary btn-sm" data-action="version-select" data-id="${row.id}">اختيار</button>
                ${row.status !== 'PUBLISHED' ? `<button class="btn btn-success btn-sm" data-action="version-publish" data-id="${row.id}">نشر</button>` : ''}
              </div>`
            ]),
            'لا توجد إصدارات بعد لهذا السيناريو.'
          )}
        </section>

        <section class="card">
          <div class="section-title"><h3>التخصيصات الحالية</h3><span class="muted">تعرض التخصيصات للإصدار المحدد حاليًا.</span></div>
          ${tableOrEmpty(
            ['الحساب', 'الفترة', 'المخطط', 'الفعلي', 'الملتزم', 'الانحراف', 'المشروع/العقد'],
            allocations.map((row) => [
              `${row.account?.code || ''} ${row.account?.nameAr || row.accountId}`.trim(),
              row.period,
              formatMoney(row.plannedAmount || 0),
              formatMoney(row.actualAmount || 0),
              formatMoney(row.committedAmount || 0),
              formatMoney(row.varianceAmount || 0),
              [row.project?.nameAr, row.contract?.title].filter(Boolean).join(' / ') || '-'
            ]),
            'اختر إصدارًا ثم أضف تخصيصات لتظهر هنا.'
          )}
        </section>

        <section class="card">
          <div class="section-title"><h3>طبقة التوافق القديمة</h3></div>
          ${tableOrEmpty(
            ['الكود', 'الاسم', 'السنة', 'الحالة', 'الإجمالي'],
            legacyBudgets.slice(0, 10).map((row) => [row.code, row.nameAr, row.fiscalYear, statusBadge(row.status), formatMoney(row.totalAmount || 0)]),
            'لا توجد بيانات توافقية قديمة بعد.'
          )}
        </section>
        ${baseSections}
      `;
    } else if (mode === 'variance') {
      const varianceSummary = varianceMeta.summary || { plannedAmount: 0, actualAmount: 0, committedAmount: 0, varianceAmount: 0 };
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>فلاتر الانحراف</h3></div>
          <div class="grid-3">
            <div><label>الإصدار</label><select id="budget-variance-version-id"><option value="">كل الإصدارات</option>${versions
              .map(
                (row) =>
                  `<option value="${row.id}" ${String(row.id) === String(state.selectedVersionId) ? 'selected' : ''}>${escapeHtml(
                    `${row.label} - ${row.scenario?.nameAr || row.scenario?.code || row.scenarioId}`
                  )}</option>`
              )
              .join('')}</select></div>
            <div><label>المشروع</label><select id="budget-variance-project-id"><option value="">كل المشاريع</option>${projects
              .map(
                (row) =>
                  `<option value="${row.id}" ${String(row.id) === String(state.varianceProjectId) ? 'selected' : ''}>${optionLabel(row, ['nameAr', 'code'])}</option>`
              )
              .join('')}</select></div>
            <div><label>الشدة</label><select id="budget-variance-severity"><option value="">الكل</option><option value="LOW" ${
              state.varianceSeverity === 'LOW' ? 'selected' : ''
            }>LOW</option><option value="MEDIUM" ${state.varianceSeverity === 'MEDIUM' ? 'selected' : ''}>MEDIUM</option><option value="HIGH" ${
              state.varianceSeverity === 'HIGH' ? 'selected' : ''
            }>HIGH</option><option value="CRITICAL" ${state.varianceSeverity === 'CRITICAL' ? 'selected' : ''}>CRITICAL</option></select></div>
          </div>
          <div class="actions" style="margin-top:16px;"><button id="budget-variance-apply" class="btn btn-primary" type="button">تطبيق</button></div>
        </section>

        <section class="kpi-grid">
          <div class="kpi"><div>المخطط</div><div class="val">${formatMoney(varianceSummary.plannedAmount || 0)}</div></div>
          <div class="kpi"><div>الفعلي</div><div class="val">${formatMoney(varianceSummary.actualAmount || 0)}</div></div>
          <div class="kpi"><div>الملتزم</div><div class="val">${formatMoney(varianceSummary.committedAmount || 0)}</div></div>
          <div class="kpi"><div>الانحراف الكلي</div><div class="val">${formatMoney(varianceSummary.varianceAmount || 0)}</div></div>
        </section>

        <section class="card">
          <div class="section-title"><h3>دفتر الانحرافات</h3></div>
          ${tableOrEmpty(
            ['الإصدار', 'الحساب', 'الفترة', 'المخطط', 'الفعلي', 'الملتزم', 'الانحراف', 'الشدة', 'الحالة'],
            variances.map((row) => [
              row.version?.label || row.versionId,
              `${row.account?.code || ''} ${row.account?.nameAr || row.accountId}`.trim(),
              row.period,
              formatMoney(row.plannedAmount || 0),
              formatMoney(row.actualAmount || 0),
              formatMoney(row.committedAmount || 0),
              formatMoney(row.varianceAmount || 0),
              statusBadge(row.severity),
              statusBadge(row.status)
            ]),
            'لا توجد انحرافات مطابقة للفلاتر الحالية.'
          )}
        </section>
        ${baseSections}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إنشاء snapshot للتوقع</h3></div>
          <form id="budget-forecast-form" class="grid-3">
            <div><label>الإصدار</label><select id="budget-forecast-version-id"><option value="">اختر الإصدار</option>${allVersionOptions}</select></div>
            <div><label>التاريخ</label><input id="budget-forecast-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>الفرع</label><select id="budget-forecast-branch-id"><option value="">من الإصدار</option>${branchOptions}</select></div>
            <div><label>العنوان</label><input id="budget-forecast-label" placeholder="Forecast Mar 2026" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="budget-forecast-notes" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ snapshot</button></div>
          </form>
        </section>

        <section class="card">
          <div class="section-title"><h3>سجل التوقعات</h3></div>
          ${tableOrEmpty(
            ['العنوان', 'الإصدار', 'التاريخ', 'المخطط', 'الفعلي', 'التوقع', 'الانحراف'],
            forecasts.map((row) => [
              row.label,
              row.version?.label || row.versionId,
              formatDate(row.snapshotDate),
              formatMoney(row.plannedTotal || 0),
              formatMoney(row.actualTotal || 0),
              formatMoney(row.forecastTotal || 0),
              formatMoney(row.varianceTotal || 0)
            ]),
            'أنشئ أول snapshot للتوقع لتبدأ المقارنة.'
          )}
        </section>
        ${baseSections}
      `;
    }

    view.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => {
        const path = element.getAttribute('data-nav');
        if (path) {
          location.hash = path.startsWith('#') ? path : `#${path}`;
        }
      });
    });

    document.getElementById('budget-scenario-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('budget-scenario-code').value.trim(),
        nameAr: document.getElementById('budget-scenario-name').value.trim(),
        fiscalYear: Number(document.getElementById('budget-scenario-year').value || new Date().getFullYear()),
        branchId: Number(document.getElementById('budget-scenario-branch-id').value || 0) || undefined,
        controlLevel: document.getElementById('budget-scenario-control-level').value,
        notes: document.getElementById('budget-scenario-notes').value.trim() || undefined
      };
      if (!payload.code || !payload.nameAr) {
        toast('أدخل رمز السيناريو واسمه قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/budgeting/scenarios', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء السيناريو');
      await load();
    });

    document.getElementById('budget-version-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        scenarioId: Number(document.getElementById('budget-version-scenario-id').value || 0),
        label: document.getElementById('budget-version-label').value.trim(),
        effectiveDate: document.getElementById('budget-version-effective-date').value || undefined,
        notes: document.getElementById('budget-version-notes').value.trim() || undefined
      };
      if (!payload.scenarioId || !payload.label) {
        toast('اختر السيناريو وأدخل اسم الإصدار', 'warning');
        return;
      }
      await withToast(() => request('/budgeting/versions', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الإصدار');
      state.selectedScenarioId = String(payload.scenarioId);
      await load();
    });

    document.getElementById('budget-allocation-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const versionId = Number(document.getElementById('budget-allocation-version-id').value || 0);
      const accountId = Number(document.getElementById('budget-allocation-account-id').value || 0);
      if (!versionId || !accountId) {
        toast('اختر الإصدار والحساب قبل حفظ التخصيص', 'warning');
        return;
      }
      const payload = {
        versionId,
        allocations: [
          {
            accountId,
            period: Number(document.getElementById('budget-allocation-period').value || 1),
            plannedAmount: Number(document.getElementById('budget-allocation-planned').value || 0),
            actualAmount: Number(document.getElementById('budget-allocation-actual').value || 0),
            committedAmount: Number(document.getElementById('budget-allocation-committed').value || 0),
            branchId: Number(document.getElementById('budget-allocation-branch-id').value || 0) || undefined,
            projectId: Number(document.getElementById('budget-allocation-project-id').value || 0) || undefined,
            contractId: Number(document.getElementById('budget-allocation-contract-id').value || 0) || undefined,
            costCenterId: Number(document.getElementById('budget-allocation-cost-center-id').value || 0) || undefined,
            departmentId: Number(document.getElementById('budget-allocation-department-id').value || 0) || undefined,
            note: document.getElementById('budget-allocation-note').value.trim() || undefined
          }
        ]
      };
      await withToast(() => request('/budgeting/allocations/upsert-bulk', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ التخصيص');
      state.selectedVersionId = String(versionId);
      await load();
    });

    document.getElementById('budget-variance-apply')?.addEventListener('click', async () => {
      state.selectedVersionId = document.getElementById('budget-variance-version-id').value || '';
      state.varianceProjectId = document.getElementById('budget-variance-project-id').value || '';
      state.varianceSeverity = document.getElementById('budget-variance-severity').value || '';
      await load();
    });

    document.getElementById('budget-forecast-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        versionId: Number(document.getElementById('budget-forecast-version-id').value || 0),
        snapshotDate: document.getElementById('budget-forecast-date').value || undefined,
        branchId: Number(document.getElementById('budget-forecast-branch-id').value || 0) || undefined,
        label: document.getElementById('budget-forecast-label').value.trim() || undefined,
        notes: document.getElementById('budget-forecast-notes').value.trim() || undefined
      };
      if (!payload.versionId) {
        toast('اختر الإصدار قبل إنشاء snapshot', 'warning');
        return;
      }
      await withToast(() => request('/budgeting/forecast/snapshot', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ snapshot التوقع');
      state.forecastVersionId = String(payload.versionId);
      await load();
    });

    view.querySelectorAll('[data-action="scenario-submit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/budgeting/scenarios/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }), 'تم إرسال السيناريو للاعتماد');
        await load();
      });
    });

    view.querySelectorAll('[data-action="scenario-approve"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد اعتماد هذا السيناريو؟');
        if (!confirmed) return;
        await withToast(() => request(`/budgeting/scenarios/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }), 'تم اعتماد السيناريو');
        await load();
      });
    });

    view.querySelectorAll('[data-action="scenario-select"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.selectedScenarioId = String(btn.getAttribute('data-id') || '');
        state.selectedVersionId = '';
        await load();
      });
    });

    view.querySelectorAll('[data-action="version-select"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.selectedVersionId = String(btn.getAttribute('data-id') || '');
        await load();
      });
    });

    view.querySelectorAll('[data-action="version-publish"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد نشر هذا الإصدار كموازنة رسمية حالية؟');
        if (!confirmed) return;
        await withToast(() => request(`/budgeting/versions/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }), 'تم نشر الإصدار');
        state.selectedVersionId = String(id);
        await load();
      });
    });

    setPageActions({
      onRefresh: () => load(),
      onSave: () => {
        const currentFormId =
          mode === 'scenarios' ? 'budget-scenario-form' : mode === 'forecast' ? 'budget-forecast-form' : null;
        if (currentFormId) {
          document.getElementById(currentFormId)?.requestSubmit();
        }
      }
    });
  };

  await load();
  if (location.hash !== `#${routeForMode(mode)}`) {
    // Keep page actions and state stable without forcing route replacement.
  }
}
