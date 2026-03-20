import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatMoney, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';

const moneyMetricKeys = new Set(['subcontracts-certified', 'subcontracts-paid', 'subcontracts-retention']);
const focusIpcStorageKey = 'subcontractors:focus-ipc';

function emptySubcontractState() {
  return {
    editingId: null,
    supplierId: '',
    projectId: '',
    title: '',
    scope: '',
    workOrderNumber: '',
    startDate: '',
    endDate: '',
    contractValue: '',
    retentionRate: '10',
    performanceRating: '',
    notes: ''
  };
}

function emptyIpcState() {
  return {
    editingId: null,
    subcontractId: '',
    certificateDate: '',
    periodStart: '',
    periodEnd: '',
    claimedAmount: '',
    certifiedAmount: '',
    retentionRate: '',
    notes: ''
  };
}

function resetSubcontractState(state) {
  state.subcontract = emptySubcontractState();
}

function resetIpcState(state) {
  state.ipc = emptyIpcState();
}

function toInputDate(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function toInputNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function badgeMarkup(label, kind = 'info') {
  return `<span class="badge ${kind}">${label}</span>`;
}

function renderWorkflowStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'SUBMITTED') return badgeMarkup('مرسل', 'info');
  if (value === 'CERTIFIED') return badgeMarkup('معتمد', 'success');
  if (value === 'APPROVED') return badgeMarkup('معتمد', 'success');
  return statusBadge(value || 'DRAFT');
}

function navigateTo(path) {
  if (!path) return;
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

function formatSummaryValue(item) {
  if (typeof item?.value === 'string') return item.value;
  if (moneyMetricKeys.has(item?.key)) return formatMoney(item.value);
  return formatNumber(item?.value);
}

function hydrateSubcontractState(state, subcontract) {
  state.subcontract = {
    editingId: subcontract.id,
    supplierId: subcontract.supplierId ? String(subcontract.supplierId) : '',
    projectId: subcontract.projectId ? String(subcontract.projectId) : '',
    title: subcontract.title || '',
    scope: subcontract.scope || '',
    workOrderNumber: subcontract.workOrderNumber || '',
    startDate: toInputDate(subcontract.startDate),
    endDate: toInputDate(subcontract.endDate),
    contractValue: toInputNumber(subcontract.contractValue),
    retentionRate: toInputNumber(subcontract.retentionRate ?? 0),
    performanceRating: toInputNumber(subcontract.performanceRating),
    notes: subcontract.notes || ''
  };
}

function hydrateIpcState(state, ipc) {
  state.ipc = {
    editingId: ipc.id,
    subcontractId: ipc.subcontractId ? String(ipc.subcontractId) : '',
    certificateDate: toInputDate(ipc.certificateDate),
    periodStart: toInputDate(ipc.periodStart),
    periodEnd: toInputDate(ipc.periodEnd),
    claimedAmount: toInputNumber(ipc.claimedAmount),
    certifiedAmount: toInputNumber(ipc.certifiedAmount),
    retentionRate: toInputNumber(ipc.retentionRate ?? ipc.subcontract?.retentionRate ?? 0),
    notes: ipc.notes || ''
  };
}

function calculateIpcNet(claimedAmount, certifiedAmount, retentionRate) {
  const claimed = Number(claimedAmount || 0);
  const certified = Number(certifiedAmount || claimed || 0);
  const rate = Number(retentionRate || 0);
  const retentionAmount = (certified * rate) / 100;
  return {
    claimedAmount: claimed,
    certifiedAmount: certified,
    retentionAmount,
    netAmount: certified - retentionAmount
  };
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

function renderQueueMarkup(queues) {
  return queues
    .map(
      (item) => `
        <button class="system-queue-item tone-${item.tone || 'info'}" type="button" data-nav="${item.route || '/systems/subcontractors'}">
          <span>${item.label}</span>
          <strong>${formatNumber(item.count)}</strong>
        </button>
      `
    )
    .join('');
}

function renderAlertMarkup(alerts) {
  const markup = alerts
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
  return markup || '<p class="muted">لا توجد تنبيهات حالياً.</p>';
}

function renderHeroCards(summary) {
  return summary
    .slice(0, 4)
    .map(
      (item) => `
        <div class="kpi">
          <div>${item.label}</div>
          <div class="val">${formatSummaryValue(item)}</div>
        </div>
      `
    )
    .join('');
}

function renderPaymentsView({ heroCards, queues, alerts, charts, activity, payables }) {
  return `
    <section class="workflow-hero card">
      <div>
        <p class="dash-overline">Subcontractors Payments</p>
        <h3>لوحة الذمم والمدفوعات لمقاولي الباطن</h3>
        <p class="muted">متابعة الذمم الناتجة عن المستخلصات، السداد الجزئي أو الكامل، والربط الفوري مع الفاتورة الشرائية المرتبطة.</p>
      </div>
      <div class="workflow-kpis">${heroCards}</div>
    </section>

    <section class="workflow-grid">
      <article class="card workflow-main">
        <div class="section-title">
          <h3>قوائم السداد</h3>
          <span class="muted">العناصر التي تحتاج دفعًا أو متابعة فورية</span>
        </div>
        <div class="system-queue-list">${renderQueueMarkup(queues)}</div>
      </article>

      <aside class="card workflow-side">
        <h3>التنبيهات</h3>
        <div class="system-alert-stack">${renderAlertMarkup(alerts)}</div>
      </aside>
    </section>

    <section class="card">
      <div class="section-title">
        <h3>سجل الذمم والمدفوعات</h3>
        <span class="muted">${payables.length} مستخلص مرتبط بذمة مورّد</span>
      </div>
      ${table(
        ['المستخلص', 'العقد', 'المورد', 'الفاتورة', 'الإجمالي', 'المسدّد', 'المتبقي', 'الحالة', 'الإجراءات'],
        payables.map((row) => [
          row.number,
          row.subcontract?.number || '-',
          row.subcontract?.supplier?.nameAr || '-',
          row.payableInvoice?.number || '-',
          formatMoney(row.payableInvoice?.total || row.netAmount || 0),
          formatMoney(row.payableInvoice?.paidAmount || 0),
          formatMoney(row.payableInvoice?.outstanding || 0),
          renderWorkflowStatus(row.payableInvoice?.status || row.status),
          `<div class="actions">
            ${Number(row.payableInvoice?.outstanding || 0) > 0.01 ? `<button class="btn btn-success btn-sm" data-action="pay" data-id="${row.id}">دفعة</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-action="view-ipc" data-id="${row.id}">تفاصيل</button>
          </div>`
        ])
      )}
    </section>

    <section class="card">
      <div class="section-title"><h3>الرسوم والمؤشرات</h3></div>
      ${renderChartBlocks(charts)}
    </section>

    <section class="card">
      <div class="section-title"><h3>النشاط الأخير</h3></div>
      ${table(['العنصر', 'الوصف', 'التاريخ', 'الحالة'], activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), renderWorkflowStatus(item.status)]))}
    </section>
  `;
}

function renderContractsView({ heroCards, queueMarkup, alertMarkup, state, suppliers, projects, subcontracts, filteredSubcontracts, filteredIpcs }) {
  const ipcTotals = calculateIpcNet(state.ipc.claimedAmount, state.ipc.certifiedAmount, state.ipc.retentionRate);

  return `
    <section class="workflow-hero card">
      <div>
        <p class="dash-overline">Subcontract to IPC to Payable</p>
        <h3>${state.subcontract.editingId ? 'تحديث عقد مقاول باطن' : 'إنشاء عقد مقاول باطن جديد'}</h3>
        <p class="muted">تفعيل العقد، إصدار المستخلص، اعتماد الذمة، ثم دفعها من داخل النظام مع تتبع الاحتجاز والمبالغ القائمة.</p>
      </div>
      <div class="workflow-kpis">${heroCards}</div>
    </section>

    <section class="workflow-grid">
      <article class="card workflow-main">
        <div class="section-title">
          <h3>${state.subcontract.editingId ? 'تحرير عقد المقاول' : 'بطاقة عقد المقاول من الباطن'}</h3>
          <div class="actions"><button id="subcontract-new" class="btn btn-secondary" type="button">عقد جديد</button></div>
        </div>

        <form id="subcontract-form" class="grid-3">
          <div>
            <label>المقاول من الباطن</label>
            <select id="subcontract-supplier-id">
              <option value="">اختر المورد/المقاول</option>
              ${suppliers.map((supplier) => `<option value="${supplier.id}" ${String(state.subcontract.supplierId) === String(supplier.id) ? 'selected' : ''}>${escapeHtml(supplier.nameAr)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>المشروع</label>
            <select id="subcontract-project-id">
              <option value="">اختر المشروع</option>
              ${projects.map((project) => `<option value="${project.id}" ${String(state.subcontract.projectId) === String(project.id) ? 'selected' : ''}>${escapeHtml(project.nameAr)}</option>`).join('')}
            </select>
          </div>
          <div><label>أمر الإسناد / المرجع</label><input id="subcontract-work-order-number" value="${escapeHtml(state.subcontract.workOrderNumber)}" /></div>
          <div style="grid-column:1 / -1;"><label>عنوان العقد</label><input id="subcontract-title" value="${escapeHtml(state.subcontract.title)}" placeholder="عنوان العقد أو نطاق العمل" /></div>
          <div><label>تاريخ البداية</label><input id="subcontract-start-date" type="date" value="${escapeHtml(state.subcontract.startDate)}" /></div>
          <div><label>تاريخ النهاية</label><input id="subcontract-end-date" type="date" value="${escapeHtml(state.subcontract.endDate)}" /></div>
          <div><label>قيمة العقد</label><input id="subcontract-contract-value" type="number" min="0" step="0.01" value="${escapeHtml(state.subcontract.contractValue)}" /></div>
          <div><label>نسبة الاحتجاز %</label><input id="subcontract-retention-rate" type="number" min="0" max="100" step="0.01" value="${escapeHtml(state.subcontract.retentionRate)}" /></div>
          <div><label>تقييم الأداء</label><input id="subcontract-performance-rating" type="number" min="1" max="5" step="1" value="${escapeHtml(state.subcontract.performanceRating)}" /></div>
          <div style="grid-column:1 / -1;"><label>نطاق العمل</label><textarea id="subcontract-scope" rows="3">${escapeHtml(state.subcontract.scope)}</textarea></div>
          <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="subcontract-notes" rows="3">${escapeHtml(state.subcontract.notes)}</textarea></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">${state.subcontract.editingId ? 'تحديث العقد' : 'حفظ العقد'}</button></div>
        </form>
      </article>

      <aside class="card workflow-side">
        <h3>قوائم العمل والتنبيهات</h3>
        <div class="system-queue-list">${queueMarkup}</div>
        <div class="section-title" style="margin-top:18px;"><h4>تنبيهات</h4></div>
        <div class="system-alert-stack">${alertMarkup}</div>
      </aside>
    </section>

    <section class="card">
      <div class="section-title">
        <h3>${state.ipc.editingId ? 'تحرير مستخلص' : 'إنشاء مستخلص IPC'}</h3>
        <div class="actions"><button id="ipc-new" class="btn btn-secondary" type="button">مستخلص جديد</button></div>
      </div>

      <form id="ipc-form" class="grid-3">
        <div>
          <label>العقد المرتبط</label>
          <select id="ipc-subcontract-id">
            <option value="">اختر العقد</option>
            ${subcontracts.filter((row) => row.status === 'ACTIVE' || String(state.ipc.subcontractId) === String(row.id)).map((row) => `<option value="${row.id}" ${String(state.ipc.subcontractId) === String(row.id) ? 'selected' : ''}>${escapeHtml(row.number)} - ${escapeHtml(row.title)}</option>`).join('')}
          </select>
        </div>
        <div><label>تاريخ المستخلص</label><input id="ipc-certificate-date" type="date" value="${escapeHtml(state.ipc.certificateDate)}" /></div>
        <div><label>من الفترة</label><input id="ipc-period-start" type="date" value="${escapeHtml(state.ipc.periodStart)}" /></div>
        <div><label>إلى الفترة</label><input id="ipc-period-end" type="date" value="${escapeHtml(state.ipc.periodEnd)}" /></div>
        <div><label>القيمة المطالب بها</label><input id="ipc-claimed-amount" type="number" min="0" step="0.01" value="${escapeHtml(state.ipc.claimedAmount)}" /></div>
        <div><label>القيمة المعتمدة</label><input id="ipc-certified-amount" type="number" min="0" step="0.01" value="${escapeHtml(state.ipc.certifiedAmount)}" /></div>
        <div><label>نسبة الاحتجاز %</label><input id="ipc-retention-rate" type="number" min="0" max="100" step="0.01" value="${escapeHtml(state.ipc.retentionRate)}" /></div>
        <div style="grid-column:1 / -1;"><label>ملاحظات المستخلص</label><textarea id="ipc-notes" rows="3">${escapeHtml(state.ipc.notes)}</textarea></div>
        <div class="workflow-summary-panel" style="grid-column:1 / -1;">
          <div class="kpi"><div>المطالبة</div><div id="ipc-claimed-total" class="val">${formatMoney(ipcTotals.claimedAmount)}</div></div>
          <div class="kpi"><div>المعتمد</div><div id="ipc-certified-total" class="val">${formatMoney(ipcTotals.certifiedAmount)}</div></div>
          <div class="kpi"><div>الاحتجاز</div><div id="ipc-retention-total" class="val">${formatMoney(ipcTotals.retentionAmount)}</div></div>
          <div class="kpi"><div>الصافي</div><div id="ipc-net-total" class="val">${formatMoney(ipcTotals.netAmount)}</div></div>
        </div>
        <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">${state.ipc.editingId ? 'تحديث المستخلص' : 'حفظ المستخلص'}</button></div>
      </form>
    </section>

    <section class="card">
      <div class="section-title"><h3>دفتر العقود</h3><span class="muted">${filteredSubcontracts.length} عقد</span></div>
      ${table(['الرقم', 'العقد', 'المورد', 'المشروع', 'القيمة', 'المعتمد', 'المسدّد', 'الحالة', 'الإجراءات'], filteredSubcontracts.map((row) => [
        row.number,
        row.title,
        row.supplier?.nameAr || '-',
        row.project?.nameAr || '-',
        formatMoney(row.contractValue || 0),
        formatMoney(row.certifiedAmount || 0),
        formatMoney(row.paidAmount || 0),
        renderWorkflowStatus(row.status),
        `<div class="actions">${row.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="activate-subcontract" data-id="${row.id}">تفعيل</button>` : ''}<button class="btn btn-warning btn-sm" data-action="edit-subcontract" data-id="${row.id}">تعديل</button></div>`
      ]))}
    </section>

    <section class="card">
      <div class="section-title"><h3>دفتر المستخلصات</h3><span class="muted">${filteredIpcs.length} مستخلص</span></div>
      ${table(['الرقم', 'العقد', 'المورد', 'المعتمد', 'الصافي', 'الفاتورة', 'المتبقي', 'الحالة', 'الإجراءات'], filteredIpcs.map((row) => [
        row.number,
        row.subcontract?.number || '-',
        row.subcontract?.supplier?.nameAr || '-',
        formatMoney(row.certifiedAmount || 0),
        formatMoney(row.netAmount || 0),
        row.payableInvoice?.number || '-',
        formatMoney(row.payableInvoice?.outstanding || 0),
        renderWorkflowStatus(row.payableInvoice?.status || row.status),
        `<div class="actions">${row.status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" data-action="edit-ipc" data-id="${row.id}">تعديل</button><button class="btn btn-info btn-sm" data-action="submit-ipc" data-id="${row.id}">إرسال</button>` : ''}${row.status === 'SUBMITTED' ? `<button class="btn btn-success btn-sm" data-action="approve-ipc" data-id="${row.id}">اعتماد وتحويل</button>` : ''}${Number(row.payableInvoice?.outstanding || 0) > 0.01 ? `<button class="btn btn-primary btn-sm" data-action="pay" data-id="${row.id}">دفعة</button>` : ''}</div>`
      ]))}
    </section>

    <section class="card">
      <div class="section-title"><h3>النشاط الأخير</h3></div>
      ${table(['العنصر', 'الوصف', 'التاريخ', 'الحالة'], filteredIpcs.slice(0, 6).map((row) => [
        row.number,
        row.subcontract?.title || '-',
        formatDate(row.certificateDate),
        renderWorkflowStatus(row.payableInvoice?.status || row.status)
      ]))}
    </section>
  `;
}

async function promptForPayment(ipc) {
  const outstanding = Number(ipc?.payableInvoice?.outstanding || 0);
  if (outstanding <= 0.01) {
    toast('هذا المستخلص مسدد بالكامل', 'warning');
    return null;
  }

  const defaultAmount = outstanding.toFixed(2);
  const amountText = window.prompt('مبلغ الدفعة المراد تسجيلها:', defaultAmount);
  if (amountText === null) return null;

  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast('أدخل مبلغًا صحيحًا أكبر من صفر', 'warning');
    return null;
  }

  const completeImmediately = await confirmAction('هل تريد اعتماد الدفعة مباشرة كمكتملة؟');
  return {
    amount,
    method: 'BANK_TRANSFER',
    date: new Date().toISOString().slice(0, 10),
    completeImmediately
  };
}

export async function renderSubcontractorsWorkspace(mode = 'contracts') {
  const isPayments = mode === 'payments';
  setTitle(isPayments ? 'مدفوعات مقاولي الباطن' : 'دفتر المقاولين من الباطن');

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام المقاولين من الباطن...</div>';

  const state = {
    subcontract: emptySubcontractState(),
    ipc: emptyIpcState()
  };

  const load = async () => {
    const focusIpcId = Number(sessionStorage.getItem(focusIpcStorageKey) || 0);

    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, subcontractsRes, ipcsRes, suppliersRes, projectsRes] = await Promise.all([
      request('/subcontractors/dashboard/summary'),
      request('/subcontractors/dashboard/queues'),
      request('/subcontractors/dashboard/alerts'),
      request('/subcontractors/dashboard/activity'),
      request('/subcontractors/dashboard/charts'),
      request('/subcontractors/subcontracts?page=1&limit=200'),
      request('/subcontractors/ipcs?page=1&limit=200'),
      request('/suppliers?page=1&limit=300'),
      request('/projects?page=1&limit=300')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const subcontracts = extractRows(subcontractsRes);
    const ipcs = extractRows(ipcsRes);
    const suppliers = extractRows(suppliersRes);
    const projects = extractRows(projectsRes);

    if (!state.ipc.editingId && focusIpcId) {
      try {
        const details = await request(`/subcontractors/ipcs/${focusIpcId}`);
        if (details?.data) {
          hydrateIpcState(state, details.data);
        }
      } finally {
        sessionStorage.removeItem(focusIpcStorageKey);
      }
    }

    const payables = ipcs
      .filter((row) => row.payableInvoiceId || row.payableInvoice)
      .sort((left, right) => Number(right.payableInvoice?.outstanding || 0) - Number(left.payableInvoice?.outstanding || 0));
    const filteredSubcontracts = [...subcontracts];
    const filteredIpcs = [...ipcs];
    const heroCards = renderHeroCards(summary);
    const queueMarkup = renderQueueMarkup(queues);
    const alertMarkup = renderAlertMarkup(alerts);

    view.innerHTML = isPayments
      ? renderPaymentsView({ heroCards, queues, alerts, charts, activity, payables })
      : renderContractsView({
          heroCards,
          queueMarkup,
          alertMarkup,
          state,
          suppliers,
          projects,
          subcontracts,
          filteredSubcontracts,
          filteredIpcs
        });

    view.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => navigateTo(element.getAttribute('data-nav')));
    });

    const handleIpcPayment = async (ipcId) => {
      const details = await request(`/subcontractors/ipcs/${ipcId}`);
      const paymentPayload = await promptForPayment(details.data);
      if (!paymentPayload) return;
      await withToast(
        () => request(`/subcontractors/ipcs/${ipcId}/payments`, { method: 'POST', body: JSON.stringify(paymentPayload) }),
        paymentPayload.completeImmediately ? 'تم تسجيل دفعة المقاول' : 'تم إنشاء طلب دفع للمقاول'
      );
    };

    if (isPayments) {
      view.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const ipcId = Number(button.getAttribute('data-id'));
          const action = button.getAttribute('data-action');
          if (!ipcId || !action) return;

          if (action === 'pay') {
            await handleIpcPayment(ipcId);
            await load();
            return;
          }

          if (action === 'view-ipc') {
            sessionStorage.setItem(focusIpcStorageKey, String(ipcId));
            navigateTo('/systems/subcontractors/contracts');
          }
        });
      });

      setPageActions({
        onNew: () => navigateTo('/systems/subcontractors/contracts'),
        onSave: null,
        onSearch: null,
        onRefresh: () => load()
      });
      return;
    }

    const contractForm = document.getElementById('subcontract-form');
    const ipcForm = document.getElementById('ipc-form');
    const ipcSubcontractSelect = document.getElementById('ipc-subcontract-id');
    const ipcClaimedAmount = document.getElementById('ipc-claimed-amount');
    const ipcCertifiedAmount = document.getElementById('ipc-certified-amount');
    const ipcRetentionRate = document.getElementById('ipc-retention-rate');

    const refreshIpcTotals = () => {
      const totals = calculateIpcNet(
        ipcClaimedAmount?.value || 0,
        ipcCertifiedAmount?.value || ipcClaimedAmount?.value || 0,
        ipcRetentionRate?.value || 0
      );
      document.getElementById('ipc-claimed-total').textContent = formatMoney(totals.claimedAmount);
      document.getElementById('ipc-certified-total').textContent = formatMoney(totals.certifiedAmount);
      document.getElementById('ipc-retention-total').textContent = formatMoney(totals.retentionAmount);
      document.getElementById('ipc-net-total').textContent = formatMoney(totals.netAmount);
    };

    ipcSubcontractSelect?.addEventListener('change', () => {
      const selected = subcontracts.find((row) => String(row.id) === String(ipcSubcontractSelect.value));
      if (selected && !ipcRetentionRate.value) {
        ipcRetentionRate.value = toInputNumber(selected.retentionRate ?? 0);
      }
      refreshIpcTotals();
    });

    [ipcClaimedAmount, ipcCertifiedAmount, ipcRetentionRate].forEach((input) => {
      input?.addEventListener('input', refreshIpcTotals);
    });
    refreshIpcTotals();

    document.getElementById('subcontract-new')?.addEventListener('click', async () => {
      resetSubcontractState(state);
      await load();
    });

    document.getElementById('ipc-new')?.addEventListener('click', async () => {
      resetIpcState(state);
      await load();
    });

    contractForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        supplierId: Number(document.getElementById('subcontract-supplier-id').value || 0) || undefined,
        projectId: Number(document.getElementById('subcontract-project-id').value || 0) || undefined,
        title: document.getElementById('subcontract-title').value.trim(),
        scope: document.getElementById('subcontract-scope').value.trim() || undefined,
        workOrderNumber: document.getElementById('subcontract-work-order-number').value.trim() || undefined,
        startDate: document.getElementById('subcontract-start-date').value || undefined,
        endDate: document.getElementById('subcontract-end-date').value || undefined,
        contractValue: document.getElementById('subcontract-contract-value').value || 0,
        retentionRate: document.getElementById('subcontract-retention-rate').value || 0,
        performanceRating: document.getElementById('subcontract-performance-rating').value || undefined,
        notes: document.getElementById('subcontract-notes').value.trim() || undefined
      };

      if (!payload.supplierId || !payload.projectId || !payload.title) {
        toast('أكمل بيانات المقاول والمشروع وعنوان العقد قبل الحفظ', 'warning');
        return;
      }

      if (state.subcontract.editingId) {
        await withToast(
          () => request(`/subcontractors/subcontracts/${state.subcontract.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }),
          'تم تحديث عقد المقاول'
        );
      } else {
        await withToast(() => request('/subcontractors/subcontracts', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء عقد المقاول');
      }

      resetSubcontractState(state);
      await load();
    });

    ipcForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        subcontractId: Number(document.getElementById('ipc-subcontract-id').value || 0) || undefined,
        certificateDate: document.getElementById('ipc-certificate-date').value || undefined,
        periodStart: document.getElementById('ipc-period-start').value || undefined,
        periodEnd: document.getElementById('ipc-period-end').value || undefined,
        claimedAmount: document.getElementById('ipc-claimed-amount').value || 0,
        certifiedAmount: document.getElementById('ipc-certified-amount').value || document.getElementById('ipc-claimed-amount').value || 0,
        retentionRate: document.getElementById('ipc-retention-rate').value || 0,
        notes: document.getElementById('ipc-notes').value.trim() || undefined
      };

      if (!payload.subcontractId || !payload.certificateDate) {
        toast('اختر العقد وأدخل تاريخ المستخلص قبل الحفظ', 'warning');
        return;
      }

      if (Number(payload.certifiedAmount || 0) > Number(payload.claimedAmount || 0)) {
        toast('القيمة المعتمدة لا يمكن أن تتجاوز القيمة المطالب بها', 'warning');
        return;
      }

      if (state.ipc.editingId) {
        await withToast(
          () => request(`/subcontractors/ipcs/${state.ipc.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }),
          'تم تحديث المستخلص'
        );
      } else {
        await withToast(() => request('/subcontractors/ipcs', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المستخلص');
      }

      resetIpcState(state);
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'edit-subcontract') {
          const details = await request(`/subcontractors/subcontracts/${id}`);
          hydrateSubcontractState(state, details.data);
          await load();
          return;
        }

        if (action === 'activate-subcontract') {
          const accepted = await confirmAction('هل تريد تفعيل عقد المقاول من الباطن؟');
          if (!accepted) return;
          await withToast(() => request(`/subcontractors/subcontracts/${id}/activate`, { method: 'POST' }), 'تم تفعيل العقد');
          await load();
          return;
        }

        if (action === 'edit-ipc') {
          const details = await request(`/subcontractors/ipcs/${id}`);
          hydrateIpcState(state, details.data);
          await load();
          return;
        }

        if (action === 'submit-ipc') {
          const accepted = await confirmAction('هل تريد إرسال هذا المستخلص للاعتماد؟');
          if (!accepted) return;
          await withToast(() => request(`/subcontractors/ipcs/${id}/submit`, { method: 'POST' }), 'تم إرسال المستخلص');
          await load();
          return;
        }

        if (action === 'approve-ipc') {
          const accepted = await confirmAction('سيتم اعتماد المستخلص وإنشاء ذمة مورّد مرتبطة به. هل تريد المتابعة؟');
          if (!accepted) return;
          await withToast(() => request(`/subcontractors/ipcs/${id}/approve`, { method: 'POST' }), 'تم اعتماد المستخلص وإنشاء الذمة');
          await load();
          return;
        }

        if (action === 'pay') {
          await handleIpcPayment(id);
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => document.getElementById('subcontract-new')?.click(),
      onSave: () => {
        const activeElement = document.activeElement;
        if (activeElement && ipcForm?.contains(activeElement)) {
          ipcForm.requestSubmit();
          return;
        }
        contractForm?.requestSubmit();
      },
      onSearch: () => document.getElementById('subcontract-title')?.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
