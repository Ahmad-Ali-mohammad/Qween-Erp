import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';
import { renderActivityTable, renderAlertStack, renderChartBlocks, renderHeroCards, renderQueueList, safeRows, toDateInput } from './workspace-common.js';

function routeForMode(mode) {
  if (mode === 'orders') return '/systems/maintenance/orders';
  if (mode === 'failures') return '/systems/maintenance/failures';
  return '/systems/maintenance/plans';
}

export async function renderMaintenanceWorkspace(mode = 'plans') {
  const titles = {
    plans: 'الصيانة المتقدمة - الخطط',
    orders: 'الصيانة المتقدمة - أوامر العمل',
    failures: 'الصيانة المتقدمة - تحليل الأعطال'
  };
  setTitle(titles[mode] || titles.plans);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام الصيانة المتقدمة...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, plansRes, ordersRes, executionsRes, failuresRes, assets, projects, employees, items, warehouses] = await Promise.all([
      request('/maintenance/dashboard/summary'),
      request('/maintenance/dashboard/queues'),
      request('/maintenance/dashboard/alerts'),
      request('/maintenance/dashboard/activity'),
      request('/maintenance/dashboard/charts'),
      request('/maintenance/plans?page=1&limit=100'),
      request('/maintenance/orders?page=1&limit=100'),
      request('/maintenance/executions?page=1&limit=100'),
      request('/maintenance/failures?page=1&limit=100'),
      safeRows('/assets?page=1&limit=200'),
      safeRows('/projects?page=1&limit=200'),
      safeRows('/hr/employees?page=1&limit=200'),
      safeRows('/inventory/items?page=1&limit=200'),
      safeRows('/inventory/warehouses?page=1&limit=200')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const plans = extractRows(plansRes);
    const orders = extractRows(ordersRes);
    const executions = extractRows(executionsRes);
    const failures = extractRows(failuresRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Maintenance</p>
          <h3>خطط الصيانة وأوامرها وتحليل الأعطال في مساحة واحدة</h3>
          <p class="muted">هذه الواجهة تربط الأصول وقطع الغيار والتكاليف التشغيلية مع المشاريع من غير الحاجة للتنقل بين شاشات متفرقة.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title"><h3>قوائم العمل</h3><span class="muted">اعتماد، تنفيذ، وإغلاق</span></div>
          <div class="system-queue-list">${renderQueueList(queues, '/systems/maintenance')}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات الصيانة</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const sharedSections = `
      <section class="card">
        <div class="section-title"><h3>الرسوم والمؤشرات</h3><span class="muted">تكلفة، أولويات، واعتمادية</span></div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${renderActivityTable(table, activity, statusBadge)}
      </section>
    `;

    if (mode === 'plans') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>خطة صيانة جديدة</h3></div>
          <form id="maintenance-plan-form" class="grid-3">
            <div><label>الأصل/المعدة</label><select id="maintenance-plan-asset-id"><option value="">اختياري</option>${assets.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المشروع</label><select id="maintenance-plan-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>نوع التكرار</label><select id="maintenance-plan-frequency"><option value="TIME">TIME</option><option value="HOURS">HOURS</option></select></div>
            <div><label>القيمة</label><input id="maintenance-plan-interval" type="number" min="1" step="1" value="1" /></div>
            <div><label>الاستحقاق التالي</label><input id="maintenance-plan-next-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>ساعات الاستحقاق</label><input id="maintenance-plan-next-hours" type="number" min="0" step="0.1" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان الخطة</label><input id="maintenance-plan-title" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="maintenance-plan-notes" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الخطة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>خطط الصيانة</h3></div>
          ${table(
            ['الكود', 'العنوان', 'الأصل', 'المشروع', 'التالي', 'الحالة'],
            plans.map((row) => [
              row.code,
              escapeHtml(row.title || '-'),
              escapeHtml(row.asset?.nameAr || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              formatDate(row.nextDueDate),
              statusBadge(row.status)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else if (mode === 'orders') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>أمر صيانة جديد</h3></div>
          <form id="maintenance-order-form" class="grid-3">
            <div><label>الخطة</label><select id="maintenance-order-plan-id"><option value="">اختياري</option>${plans.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>الأصل</label><select id="maintenance-order-asset-id"><option value="">اختياري</option>${assets.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المشروع</label><select id="maintenance-order-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الأولوية</label><select id="maintenance-order-priority"><option value="LOW">LOW</option><option value="MEDIUM" selected>MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></div>
            <div><label>تاريخ الجدولة</label><input id="maintenance-order-scheduled-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>تاريخ الاستحقاق</label><input id="maintenance-order-due-date" type="date" value="${toDateInput(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))}" /></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="maintenance-order-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="maintenance-order-description" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إنشاء الأمر</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>تسجيل تنفيذ</h3></div>
          <form id="maintenance-execution-form" class="grid-3">
            <div><label>أمر الصيانة</label><select id="maintenance-execution-order-id"><option value="">اختر الأمر</option>${orders.map((row) => `<option value="${row.id}">${escapeHtml(row.number)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>الفني</label><select id="maintenance-execution-employee-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>تاريخ التنفيذ</label><input id="maintenance-execution-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>ساعات العمل</label><input id="maintenance-execution-hours" type="number" min="0" step="0.1" /></div>
            <div><label>تكلفة العمالة</label><input id="maintenance-execution-labor-cost" type="number" min="0" step="0.01" /></div>
            <div><label>قطعة الغيار</label><select id="maintenance-execution-item-id"><option value="">اختياري</option>${items.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المستودع</label><select id="maintenance-execution-warehouse-id"><option value="">اختياري</option>${warehouses.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الكمية</label><input id="maintenance-execution-qty" type="number" min="0" step="0.01" /></div>
            <div><label>تكلفة القطع</label><input id="maintenance-execution-spare-cost" type="number" min="0" step="0.01" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">تسجيل التنفيذ</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>أوامر الصيانة</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'الأصل', 'المشروع', 'الاستحقاق', 'الحالة', 'الاعتماد', 'الإجراءات'],
            orders.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.asset?.nameAr || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              formatDate(row.dueDate),
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.approvalStatus === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit-order" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve-order" data-id="${row.id}">اعتماد</button>` : ''}
                ${row.approvalStatus === 'APPROVED' && row.status !== 'COMPLETED' ? `<button class="btn btn-primary btn-sm" data-action="complete-order" data-id="${row.id}">إكمال</button>` : ''}
              </div>`
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>التنفيذات المسجلة</h3></div>
          ${table(
            ['الأمر', 'الفني', 'التاريخ', 'العمالة', 'قطع الغيار', 'التكلفة'],
            executions.map((row) => [
              escapeHtml(row.order?.number || '-'),
              escapeHtml(row.technician?.fullName || '-'),
              formatDate(row.executionDate),
              formatNumber(row.laborCost || 0),
              formatNumber(row.spareQuantity || 0),
              formatNumber((Number(row.laborCost || 0) + Number(row.spareCost || 0)) || 0)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تحليل عطل جديد</h3></div>
          <form id="maintenance-failure-form" class="grid-3">
            <div><label>أمر الصيانة</label><select id="maintenance-failure-order-id"><option value="">اختياري</option>${orders.map((row) => `<option value="${row.id}">${escapeHtml(row.number)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>الأصل</label><select id="maintenance-failure-asset-id"><option value="">اختياري</option>${assets.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المشروع</label><select id="maintenance-failure-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>التاريخ</label><input id="maintenance-failure-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>الشدة</label><select id="maintenance-failure-severity"><option value="LOW">LOW</option><option value="MEDIUM" selected>MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></div>
            <div><label>MTBF</label><input id="maintenance-failure-mtbf" type="number" min="0" step="0.1" /></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="maintenance-failure-title" /></div>
            <div style="grid-column:1 / -1;"><label>نوع العطل</label><input id="maintenance-failure-mode" /></div>
            <div style="grid-column:1 / -1;"><label>السبب الجذري</label><textarea id="maintenance-failure-root" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">تسجيل التحليل</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>تحليلات الأعطال</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'الأصل', 'المشروع', 'الشدة', 'التاريخ', 'الحالة'],
            failures.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.asset?.nameAr || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              statusBadge(row.severity),
              formatDate(row.incidentDate),
              statusBadge(row.status)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    }

    view.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => {
        const path = element.getAttribute('data-nav');
        if (path) location.hash = path.startsWith('#') ? path : `#${path}`;
      });
    });

    document.getElementById('maintenance-plan-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        assetId: Number(document.getElementById('maintenance-plan-asset-id').value || 0) || undefined,
        projectId: Number(document.getElementById('maintenance-plan-project-id').value || 0) || undefined,
        title: document.getElementById('maintenance-plan-title').value.trim(),
        frequencyType: document.getElementById('maintenance-plan-frequency').value,
        intervalValue: Number(document.getElementById('maintenance-plan-interval').value || 1),
        nextDueDate: document.getElementById('maintenance-plan-next-date').value || undefined,
        nextDueHours: document.getElementById('maintenance-plan-next-hours').value || undefined,
        notes: document.getElementById('maintenance-plan-notes').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان الخطة', 'warning');
        return;
      }
      await withToast(() => request('/maintenance/plans', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء خطة الصيانة');
      await load();
    });

    document.getElementById('maintenance-order-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        planId: Number(document.getElementById('maintenance-order-plan-id').value || 0) || undefined,
        assetId: Number(document.getElementById('maintenance-order-asset-id').value || 0) || undefined,
        projectId: Number(document.getElementById('maintenance-order-project-id').value || 0) || undefined,
        title: document.getElementById('maintenance-order-title').value.trim(),
        description: document.getElementById('maintenance-order-description').value.trim() || undefined,
        priority: document.getElementById('maintenance-order-priority').value,
        scheduledDate: document.getElementById('maintenance-order-scheduled-date').value || undefined,
        dueDate: document.getElementById('maintenance-order-due-date').value || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان أمر الصيانة', 'warning');
        return;
      }
      await withToast(() => request('/maintenance/orders', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء أمر الصيانة');
      await load();
    });

    document.getElementById('maintenance-execution-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        orderId: Number(document.getElementById('maintenance-execution-order-id').value || 0) || undefined,
        technicianEmployeeId: Number(document.getElementById('maintenance-execution-employee-id').value || 0) || undefined,
        executionDate: document.getElementById('maintenance-execution-date').value || undefined,
        hoursWorked: document.getElementById('maintenance-execution-hours').value || undefined,
        laborCost: document.getElementById('maintenance-execution-labor-cost').value || undefined,
        spareItemId: Number(document.getElementById('maintenance-execution-item-id').value || 0) || undefined,
        warehouseId: Number(document.getElementById('maintenance-execution-warehouse-id').value || 0) || undefined,
        spareQuantity: document.getElementById('maintenance-execution-qty').value || undefined,
        spareCost: document.getElementById('maintenance-execution-spare-cost').value || undefined
      };
      if (!payload.orderId) {
        toast('اختر أمر الصيانة قبل التسجيل', 'warning');
        return;
      }
      await withToast(() => request('/maintenance/executions', { method: 'POST', body: JSON.stringify(payload) }), 'تم تسجيل التنفيذ');
      await load();
    });

    document.getElementById('maintenance-failure-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        orderId: Number(document.getElementById('maintenance-failure-order-id').value || 0) || undefined,
        assetId: Number(document.getElementById('maintenance-failure-asset-id').value || 0) || undefined,
        projectId: Number(document.getElementById('maintenance-failure-project-id').value || 0) || undefined,
        incidentDate: document.getElementById('maintenance-failure-date').value || undefined,
        severity: document.getElementById('maintenance-failure-severity').value,
        mtbfHours: document.getElementById('maintenance-failure-mtbf').value || undefined,
        title: document.getElementById('maintenance-failure-title').value.trim(),
        failureMode: document.getElementById('maintenance-failure-mode').value.trim(),
        rootCause: document.getElementById('maintenance-failure-root').value.trim() || undefined
      };
      if (!payload.title || !payload.failureMode) {
        toast('أدخل عنوان العطل ونوعه', 'warning');
        return;
      }
      await withToast(() => request('/maintenance/failures', { method: 'POST', body: JSON.stringify(payload) }), 'تم تسجيل تحليل العطل');
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'submit-order') {
          await withToast(() => request(`/maintenance/orders/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }), 'تم إرسال الأمر');
          await load();
          return;
        }
        if (action === 'approve-order') {
          await withToast(() => request(`/maintenance/orders/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }), 'تم اعتماد الأمر');
          await load();
          return;
        }
        if (action === 'complete-order') {
          const accepted = await confirmAction('هل تريد إكمال أمر الصيانة؟');
          if (!accepted) return;
          await withToast(() => request(`/maintenance/orders/${id}/complete`, { method: 'POST', body: JSON.stringify({}) }), 'تم إكمال أمر الصيانة');
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'plans' ? 'orders' : mode === 'orders' ? 'failures' : 'plans';
        location.hash = `#${routeForMode(nextMode)}`;
      },
      onSave: () => document.querySelector('form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
