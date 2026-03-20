import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatMoney, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { bindLookupField, buildEntityLabel, escapeHtml, renderLookupField } from '../flows/commercial/document-workspace.js';

function emptyEstimateLine() {
  return {
    category: '',
    description: '',
    costType: '',
    quantity: 1,
    unitCost: 0
  };
}

function emptyCompetitor() {
  return {
    name: '',
    offeredValue: 0,
    rank: '',
    notes: ''
  };
}

function normalizeEstimateRows(lines = []) {
  return lines
    .map((line) => ({
      category: String(line.category || '').trim(),
      description: String(line.description || '').trim(),
      costType: String(line.costType || '').trim(),
      quantity: Number(line.quantity || 0),
      unitCost: Number(line.unitCost || 0)
    }))
    .filter((line) => line.description);
}

function normalizeCompetitorRows(rows = []) {
  return rows
    .map((row) => ({
      name: String(row.name || '').trim(),
      offeredValue: Number(row.offeredValue || 0),
      rank: row.rank ? Number(row.rank) : '',
      notes: String(row.notes || '').trim()
    }))
    .filter((row) => row.name);
}

function calculateTenderTotals(lines = []) {
  const normalized = normalizeEstimateRows(lines);
  const estimatedValue = normalized.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  return {
    lines: normalized,
    estimatedValue: Math.round(estimatedValue * 100) / 100
  };
}

function renderEstimateRows(lines) {
  return lines
    .map(
      (line, index) => `
        <tr data-estimate-index="${index}">
          <td><input class="tender-line-category" value="${escapeHtml(line.category || '')}" placeholder="مواد / عمالة / معدات" /></td>
          <td><input class="tender-line-description" value="${escapeHtml(line.description || '')}" placeholder="وصف بند التقدير" /></td>
          <td><input class="tender-line-cost-type" value="${escapeHtml(line.costType || '')}" placeholder="مباشر / غير مباشر" /></td>
          <td><input class="tender-line-qty" type="number" min="0" step="0.01" value="${Number(line.quantity || 0)}" /></td>
          <td><input class="tender-line-unit-cost" type="number" min="0" step="0.01" value="${Number(line.unitCost || 0)}" /></td>
          <td class="tender-line-total">${formatMoney(Number(line.quantity || 0) * Number(line.unitCost || 0))}</td>
          <td><button type="button" class="btn btn-danger btn-sm" data-remove-estimate="${index}">حذف</button></td>
        </tr>
      `
    )
    .join('');
}

function renderCompetitorRows(rows) {
  return rows
    .map(
      (row, index) => `
        <tr data-competitor-index="${index}">
          <td><input class="tender-competitor-name" value="${escapeHtml(row.name || '')}" placeholder="اسم المنافس" /></td>
          <td><input class="tender-competitor-value" type="number" min="0" step="0.01" value="${Number(row.offeredValue || 0)}" /></td>
          <td><input class="tender-competitor-rank" type="number" min="1" step="1" value="${escapeHtml(row.rank || '')}" /></td>
          <td><input class="tender-competitor-notes" value="${escapeHtml(row.notes || '')}" placeholder="ملاحظات" /></td>
          <td><button type="button" class="btn btn-danger btn-sm" data-remove-competitor="${index}">حذف</button></td>
        </tr>
      `
    )
    .join('');
}

function collectEstimateRows(container) {
  return Array.from(container.querySelectorAll('tr')).map((row) => ({
    category: row.querySelector('.tender-line-category')?.value || '',
    description: row.querySelector('.tender-line-description')?.value || '',
    costType: row.querySelector('.tender-line-cost-type')?.value || '',
    quantity: Number(row.querySelector('.tender-line-qty')?.value || 0),
    unitCost: Number(row.querySelector('.tender-line-unit-cost')?.value || 0)
  }));
}

function collectCompetitorRows(container) {
  return Array.from(container.querySelectorAll('tr')).map((row) => ({
    name: row.querySelector('.tender-competitor-name')?.value || '',
    offeredValue: Number(row.querySelector('.tender-competitor-value')?.value || 0),
    rank: row.querySelector('.tender-competitor-rank')?.value || '',
    notes: row.querySelector('.tender-competitor-notes')?.value || ''
  }));
}

function renderChartBlocks(charts) {
  return `
    <div class="system-chart-grid">
      ${charts
        .map(
          (chart) => `
            <article class="system-chart-card chart-${chart.kind}">
              <div class="system-section-head">
                <h3>${chart.title}</h3>
                <span>${chart.kind === 'donut' ? 'توزيع' : 'اتجاه'}</span>
              </div>
              <div class="system-chart-series">
                ${(() => {
                  const maxValue = Math.max(1, ...chart.series.map((row) => Number(row.value || 0)));
                  return chart.series
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
                    .join('');
                })()}
              </div>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

export async function renderTenderingWorkspace(mode = 'tenders') {
  const isAnalysis = mode === 'analysis';
  setTitle(isAnalysis ? 'تحليل العطاءات' : 'دفتر العطاءات والمناقصات');

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام العطاءات...</div>';

  const state = {
    editingId: null,
    selectedCustomerId: '',
    selectedOpportunityId: '',
    title: '',
    issuerName: '',
    bidDueDate: '',
    offeredValue: '',
    guaranteeAmount: '',
    notes: '',
    search: '',
    status: '',
    estimateLines: [emptyEstimateLine()],
    competitors: [emptyCompetitor()]
  };

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, tendersRes, customersRes, opportunitiesRes] = await Promise.all([
      request('/tendering/dashboard/summary'),
      request('/tendering/dashboard/queues'),
      request('/tendering/dashboard/alerts'),
      request('/tendering/dashboard/activity'),
      request('/tendering/dashboard/charts'),
      request('/tendering/tenders?page=1&limit=100'),
      request('/customers?page=1&limit=400'),
      request('/crm/opportunities?page=1&limit=300')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const tenders = extractRows(tendersRes);
    const customers = extractRows(customersRes);
    const opportunities = extractRows(opportunitiesRes);

    const filteredTenders = tenders.filter((tender) => {
      const haystack = [tender.number, tender.title, tender.customer?.nameAr, tender.opportunity?.title, tender.issuerName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = state.search ? haystack.includes(state.search.toLowerCase()) : true;
      const matchesStatus = state.status ? String(tender.status) === state.status || String(tender.result || '') === state.status : true;
      return matchesSearch && matchesStatus;
    });

    const heroCards = summary
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

    if (isAnalysis) {
      view.innerHTML = `
        <section class="workflow-hero card">
          <div>
            <p class="dash-overline">Tendering Intelligence</p>
            <h3>لوحة تحليل عميقة للعطاءات</h3>
            <p class="muted">هذه الصفحة مخصصة للقراءة والتحليل: حالات العطاءات، القيم المقدمة، التنبيهات، والنشاط الأخير.</p>
          </div>
          <div class="workflow-kpis">${heroCards}</div>
        </section>

        <section class="workflow-grid">
          <article class="card workflow-main">
            <div class="section-title">
              <h3>حالة طوابير العمل</h3>
              <span class="muted">العناصر التي تحتاج قرارًا أو متابعة خلال الدورة الحالية</span>
            </div>
            ${table(
              ['القائمة', 'العدد'],
              queues.map((item) => [item.label, formatNumber(item.count)])
            )}
          </article>

          <aside class="card workflow-side">
            <h3>تنبيهات وتحذيرات</h3>
            <div class="system-alert-stack">
              ${alerts
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
                .join('')}
            </div>
          </aside>
        </section>

        <section class="card">
          <div class="section-title">
            <h3>الرسوم والمؤشرات</h3>
            <span class="muted">ملخص الاتجاهات والحالات الحالية</span>
          </div>
          ${renderChartBlocks(charts)}
        </section>

        <section class="card">
          <div class="section-title">
            <h3>النشاط الأخير</h3>
            <span class="muted">آخر التحديثات داخل النظام</span>
          </div>
          ${table(
            ['العنصر', 'الوصف', 'التاريخ', 'الحالة'],
            activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), statusBadge(item.status)])
          )}
        </section>
      `;

      setPageActions({
        onSearch: null,
        onSave: null,
        onNew: () => {
          location.hash = '#/systems/tendering/tenders';
        },
        onRefresh: () => load()
      });
      return;
    }

    view.innerHTML = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">من الفرصة إلى العقد والمشروع</p>
          <h3>${state.editingId ? 'تحديث ملف عطاء قائم' : 'إعداد عطاء جديد'}</h3>
          <p class="muted">أدر التقديرات، المنافسين، الإرسال، ثم سجل النتيجة مع تحويل العطاء الرابح إلى عقد/مشروع عند وجود فرصة مرتبطة.</p>
        </div>
        <div class="workflow-kpis">${heroCards}</div>
      </section>

      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>${state.editingId ? 'تحرير العطاء' : 'بطاقة العطاء'}</h3>
            <div class="actions">
              <button id="tender-new" class="btn btn-secondary" type="button">عطاء جديد</button>
              <button id="tender-add-line" class="btn btn-primary" type="button">إضافة بند</button>
              <button id="tender-add-competitor" class="btn btn-info" type="button">إضافة منافس</button>
            </div>
          </div>

          <form id="tender-form" class="grid-3">
            <div style="grid-column:1 / -1;">
              <label>عنوان العطاء</label>
              <input id="tender-title" value="${escapeHtml(state.title)}" placeholder="اسم المشروع / الجهة / نطاق العمل" />
            </div>

            ${renderLookupField({
              inputId: 'tender-customer-input',
              hiddenId: 'tender-customer-id',
              listId: 'tender-customer-list',
              label: 'العميل',
              placeholder: 'ابحث باسم أو كود العميل',
              entities: customers,
              selectedId: state.selectedCustomerId
            })}

            <div>
              <label>الفرصة المرتبطة</label>
              <select id="tender-opportunity-id">
                <option value="">بدون فرصة مرتبطة</option>
                ${opportunities
                  .map(
                    (opportunity) => `
                      <option value="${opportunity.id}" ${String(state.selectedOpportunityId) === String(opportunity.id) ? 'selected' : ''}>
                        ${escapeHtml(opportunity.title)}
                      </option>
                    `
                  )
                  .join('')}
              </select>
            </div>

            <div><label>جهة الطرح</label><input id="tender-issuer-name" value="${escapeHtml(state.issuerName)}" placeholder="اسم الجهة أو المرجع" /></div>
            <div><label>موعد الإغلاق</label><input id="tender-bid-due-date" type="date" value="${escapeHtml(state.bidDueDate)}" /></div>
            <div><label>القيمة المقدمة</label><input id="tender-offered-value" type="number" min="0" step="0.01" value="${escapeHtml(state.offeredValue)}" placeholder="تترك فارغة لتساوي التقدير" /></div>
            <div><label>قيمة الضمان</label><input id="tender-guarantee-amount" type="number" min="0" step="0.01" value="${escapeHtml(state.guaranteeAmount)}" /></div>

            <div style="grid-column:1 / -1;">
              <label>ملاحظات العطاء</label>
              <textarea id="tender-notes" rows="3" placeholder="افتراضات التسعير أو نقاط التفاوض">${escapeHtml(state.notes)}</textarea>
            </div>

            <div style="grid-column:1 / -1;">
              <div class="section-title">
                <h4>بنود التقدير</h4>
                <span class="muted">التجميع هنا يصنع القيمة التقديرية النهائية</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الفئة</th>
                      <th>الوصف</th>
                      <th>نوع التكلفة</th>
                      <th>الكمية</th>
                      <th>تكلفة الوحدة</th>
                      <th>الإجمالي</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody id="tender-estimate-lines"></tbody>
                </table>
              </div>
            </div>

            <div style="grid-column:1 / -1;">
              <div class="section-title">
                <h4>المنافسون</h4>
                <span class="muted">سجّل عروض السوق والتحليل المقارن</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>المنافس</th>
                      <th>القيمة</th>
                      <th>الترتيب</th>
                      <th>ملاحظات</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody id="tender-competitors"></tbody>
                </table>
              </div>
            </div>

            <div class="workflow-summary-panel" style="grid-column:1 / -1;">
              <div class="kpi"><div>القيمة التقديرية</div><div id="tender-estimated-total" class="val">0.00</div></div>
              <div class="kpi"><div>القيمة المقدمة</div><div id="tender-offered-total" class="val">0.00</div></div>
              <div class="kpi"><div>عدد المنافسين</div><div id="tender-competitors-count" class="val">0</div></div>
            </div>

            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">${state.editingId ? 'تحديث العطاء' : 'حفظ العطاء'}</button>
            </div>
          </form>
        </article>

        <aside class="card workflow-side">
          <h3>متابعة سريعة</h3>
          <div class="grid-2">
            <div><label>بحث</label><input id="tender-search" value="${escapeHtml(state.search)}" placeholder="رقم، عنوان، عميل" /></div>
            <div>
              <label>الحالة</label>
              <select id="tender-status-filter">
                <option value="">كل الحالات</option>
                <option value="DRAFT" ${state.status === 'DRAFT' ? 'selected' : ''}>مسودة</option>
                <option value="SUBMITTED" ${state.status === 'SUBMITTED' ? 'selected' : ''}>مرسل</option>
                <option value="WON" ${state.status === 'WON' ? 'selected' : ''}>فائز</option>
                <option value="LOST" ${state.status === 'LOST' ? 'selected' : ''}>خاسر</option>
                <option value="CANCELLED" ${state.status === 'CANCELLED' ? 'selected' : ''}>ملغي</option>
              </select>
            </div>
          </div>
          <div class="actions" style="margin-top:10px;">
            <button id="tender-search-btn" class="btn btn-info btn-sm" type="button">تطبيق</button>
            <button id="tender-reset-filters" class="btn btn-secondary btn-sm" type="button">إعادة ضبط</button>
          </div>

          <div class="section-title" style="margin-top:18px;">
            <h4>أولوية اليوم</h4>
            <span class="muted">قوائم العمل القادمة من dashboard</span>
          </div>
          <div class="system-queue-list">
            ${queues
              .map(
                (item) => `
                  <button class="system-queue-item" type="button" data-nav="${item.route || '/systems/tendering/tenders'}">
                    <span>${item.label}</span>
                    <strong>${formatNumber(item.count)}</strong>
                  </button>
                `
              )
              .join('')}
          </div>

          <div class="section-title" style="margin-top:18px;">
            <h4>تنبيهات</h4>
          </div>
          <div class="system-alert-stack">
            ${alerts
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
              .join('')}
          </div>
        </aside>
      </section>

      <section class="card">
        <div class="section-title">
          <h3>دفتر العطاءات</h3>
          <span class="muted">${filteredTenders.length} عنصر مطابق</span>
        </div>
        ${table(
          ['الرقم', 'العنوان', 'العميل', 'الإغلاق', 'القيمة', 'الحالة', 'الإجراءات'],
          filteredTenders.map((tender) => [
            tender.number,
            tender.title,
            tender.customer?.nameAr || '-',
            formatDate(tender.bidDueDate),
            formatMoney(tender.offeredValue || tender.estimatedValue || 0),
            statusBadge(tender.result || tender.status),
            `<div class="actions">
              ${!tender.result ? `<button class="btn btn-warning btn-sm" data-action="edit" data-id="${tender.id}">تعديل</button>` : ''}
              ${tender.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit" data-id="${tender.id}">إرسال</button>` : ''}
              ${tender.status === 'SUBMITTED' ? `<button class="btn btn-success btn-sm" data-action="won" data-id="${tender.id}">فوز</button>` : ''}
              ${tender.status === 'SUBMITTED' ? `<button class="btn btn-danger btn-sm" data-action="lost" data-id="${tender.id}">خسارة</button>` : ''}
              ${tender.status === 'SUBMITTED' ? `<button class="btn btn-secondary btn-sm" data-action="cancel" data-id="${tender.id}">إلغاء</button>` : ''}
            </div>`
          ])
        )}
      </section>
    `;

    const customerField = bindLookupField({
      inputId: 'tender-customer-input',
      hiddenId: 'tender-customer-id',
      entities: customers,
      onResolved(match) {
        state.selectedCustomerId = match ? String(match.id) : '';
      }
    });

    const estimateContainer = document.getElementById('tender-estimate-lines');
    const competitorsContainer = document.getElementById('tender-competitors');

    const syncEstimateRows = () => {
      state.estimateLines = collectEstimateRows(estimateContainer);
      if (!state.estimateLines.some((line) => line.description || line.category || line.costType || line.quantity || line.unitCost)) {
        state.estimateLines = [emptyEstimateLine()];
      }
      estimateContainer.innerHTML = renderEstimateRows(state.estimateLines);
      bindEstimateRowEvents();
      const totals = calculateTenderTotals(state.estimateLines);
      const offeredValue = Number(document.getElementById('tender-offered-value').value || totals.estimatedValue || 0);
      document.getElementById('tender-estimated-total').textContent = formatMoney(totals.estimatedValue);
      document.getElementById('tender-offered-total').textContent = formatMoney(offeredValue);
      return totals;
    };

    const syncCompetitors = () => {
      state.competitors = collectCompetitorRows(competitorsContainer);
      if (!state.competitors.some((row) => row.name || row.offeredValue || row.rank || row.notes)) {
        state.competitors = [emptyCompetitor()];
      }
      competitorsContainer.innerHTML = renderCompetitorRows(state.competitors);
      bindCompetitorEvents();
      document.getElementById('tender-competitors-count').textContent = formatNumber(
        normalizeCompetitorRows(state.competitors).length
      );
    };

    const bindEstimateRowEvents = () => {
      estimateContainer.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', syncEstimateRows);
      });
      estimateContainer.querySelectorAll('[data-remove-estimate]').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-remove-estimate'));
          state.estimateLines.splice(index, 1);
          syncEstimateRows();
        });
      });
    };

    const bindCompetitorEvents = () => {
      competitorsContainer.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', syncCompetitors);
      });
      competitorsContainer.querySelectorAll('[data-remove-competitor]').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-remove-competitor'));
          state.competitors.splice(index, 1);
          syncCompetitors();
        });
      });
    };

    estimateContainer.innerHTML = renderEstimateRows(state.estimateLines);
    competitorsContainer.innerHTML = renderCompetitorRows(state.competitors);
    bindEstimateRowEvents();
    bindCompetitorEvents();
    syncEstimateRows();
    syncCompetitors();

    document.getElementById('tender-add-line').addEventListener('click', () => {
      state.estimateLines.push(emptyEstimateLine());
      syncEstimateRows();
    });

    document.getElementById('tender-add-competitor').addEventListener('click', () => {
      state.competitors.push(emptyCompetitor());
      syncCompetitors();
    });

    document.getElementById('tender-offered-value').addEventListener('input', syncEstimateRows);

    document.getElementById('tender-new').addEventListener('click', async () => {
      state.editingId = null;
      state.selectedCustomerId = '';
      state.selectedOpportunityId = '';
      state.title = '';
      state.issuerName = '';
      state.bidDueDate = '';
      state.offeredValue = '';
      state.guaranteeAmount = '';
      state.notes = '';
      state.estimateLines = [emptyEstimateLine()];
      state.competitors = [emptyCompetitor()];
      await load();
    });

    document.getElementById('tender-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const resolvedCustomer = customerField.resolve();
      const totals = calculateTenderTotals(collectEstimateRows(estimateContainer));
      const payload = {
        title: document.getElementById('tender-title').value.trim(),
        customerId: Number(document.getElementById('tender-customer-id').value || 0) || undefined,
        opportunityId: Number(document.getElementById('tender-opportunity-id').value || 0) || undefined,
        issuerName: document.getElementById('tender-issuer-name').value.trim() || undefined,
        bidDueDate: document.getElementById('tender-bid-due-date').value || undefined,
        offeredValue: document.getElementById('tender-offered-value').value || undefined,
        guaranteeAmount: document.getElementById('tender-guarantee-amount').value || undefined,
        notes: document.getElementById('tender-notes').value.trim() || undefined,
        estimateLines: totals.lines,
        competitors: normalizeCompetitorRows(collectCompetitorRows(competitorsContainer))
      };

      if (!payload.title) {
        toast('أدخل عنوان العطاء قبل الحفظ', 'warning');
        return;
      }

      if (document.getElementById('tender-customer-input').value.trim() && !resolvedCustomer) {
        toast('اختر العميل من القائمة المقترحة أو امسح الحقل', 'warning');
        return;
      }

      if (state.editingId) {
        await withToast(() => request(`/tendering/tenders/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث العطاء');
      } else {
        await withToast(() => request('/tendering/tenders', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء العطاء');
      }

      state.editingId = null;
      state.title = '';
      state.selectedCustomerId = '';
      state.selectedOpportunityId = '';
      state.issuerName = '';
      state.bidDueDate = '';
      state.offeredValue = '';
      state.guaranteeAmount = '';
      state.notes = '';
      state.estimateLines = [emptyEstimateLine()];
      state.competitors = [emptyCompetitor()];
      await load();
    });

    document.getElementById('tender-search-btn').addEventListener('click', async () => {
      state.search = document.getElementById('tender-search').value.trim();
      state.status = document.getElementById('tender-status-filter').value;
      await load();
    });

    document.getElementById('tender-reset-filters').addEventListener('click', async () => {
      state.search = '';
      state.status = '';
      await load();
    });

    const handleResultAction = async (tenderId, result) => {
      const tender = tenders.find((item) => Number(item.id) === Number(tenderId));
      const reason = window.prompt('سبب النتيجة أو ملاحظات اللجنة (اختياري):', '') || undefined;
      const payload = {
        result,
        resultReason: reason
      };

      if (result === 'WON' && tender?.opportunityId) {
        payload.createProject = await confirmAction('هل تريد إنشاء مشروع من الفرصة المرتبطة عند الترسية؟');
      }

      const response = await withToast(
        () => request(`/tendering/tenders/${tenderId}/result`, { method: 'POST', body: JSON.stringify(payload) }),
        result === 'WON' ? 'تم تسجيل العطاء كفائز' : result === 'LOST' ? 'تم تسجيل العطاء كخاسر' : 'تم إلغاء العطاء'
      );

      if (result === 'WON' && response?.data?.contract?.number) {
        toast(`تم إنشاء العقد ${response.data.contract.number}`, 'success');
      }
    };

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const tenderId = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');

        if (action === 'edit') {
          const details = await request(`/tendering/tenders/${tenderId}`);
          const tender = details.data;
          state.editingId = tender.id;
          state.title = tender.title || '';
          state.selectedCustomerId = String(tender.customerId || '');
          state.selectedOpportunityId = String(tender.opportunityId || '');
          state.issuerName = tender.issuerName || '';
          state.bidDueDate = tender.bidDueDate ? String(tender.bidDueDate).slice(0, 10) : '';
          state.offeredValue = tender.offeredValue ? String(Number(tender.offeredValue)) : '';
          state.guaranteeAmount = tender.guaranteeAmount ? String(Number(tender.guaranteeAmount)) : '';
          state.notes = tender.notes || '';
          state.estimateLines = Array.isArray(tender.estimateLines) && tender.estimateLines.length ? tender.estimateLines : [emptyEstimateLine()];
          state.competitors = Array.isArray(tender.competitors) && tender.competitors.length ? tender.competitors : [emptyCompetitor()];
          await load();
          return;
        }

        if (action === 'submit') {
          await withToast(() => request(`/tendering/tenders/${tenderId}/submit`, { method: 'POST' }), 'تم إرسال العطاء');
        }

        if (action === 'won') {
          await handleResultAction(tenderId, 'WON');
        }

        if (action === 'lost') {
          await handleResultAction(tenderId, 'LOST');
        }

        if (action === 'cancel') {
          const accepted = await confirmAction('هل تريد إلغاء هذا العطاء؟');
          if (!accepted) return;
          await handleResultAction(tenderId, 'CANCELLED');
        }

        await load();
      });
    });

    view.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => {
        const path = element.getAttribute('data-nav');
        if (path) location.hash = path;
      });
    });

    setPageActions({
      onNew: () => document.getElementById('tender-new').click(),
      onSave: () => document.getElementById('tender-form').requestSubmit(),
      onSearch: () => document.getElementById('tender-search').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
