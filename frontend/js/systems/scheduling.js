import { extractRows, request, withToast } from '../core/api.js';
import { formatDate, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';
import { renderActivityTable, renderAlertStack, renderChartBlocks, renderHeroCards, renderQueueList, safeRows, toDateInput } from './workspace-common.js';

function routeForMode(mode) {
  if (mode === 'tasks') return '/systems/scheduling/tasks';
  if (mode === 'critical-path') return '/systems/scheduling/critical-path';
  return '/systems/scheduling/plans';
}

function buildAssignmentOptions(type, employees, assets) {
  if (type === 'ASSET') {
    return assets.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('');
  }
  return employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('');
}

export async function renderSchedulingWorkspace(mode = 'plans') {
  const titles = {
    plans: 'الجدولة الزمنية - الخطط',
    tasks: 'الجدولة الزمنية - المهام والموارد',
    'critical-path': 'الجدولة الزمنية - الاعتماديات والمسار الحرج'
  };
  setTitle(titles[mode] || titles.plans);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام الجدولة الزمنية...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, plansRes, tasksRes, dependenciesRes, snapshotsRes, projects, employees, assets] = await Promise.all([
      request('/scheduling/dashboard/summary'),
      request('/scheduling/dashboard/queues'),
      request('/scheduling/dashboard/alerts'),
      request('/scheduling/dashboard/activity'),
      request('/scheduling/dashboard/charts'),
      request('/scheduling/plans?page=1&limit=100'),
      request('/scheduling/tasks?page=1&limit=100'),
      request('/scheduling/dependencies?page=1&limit=100'),
      request('/scheduling/critical-path?page=1&limit=100'),
      safeRows('/projects?page=1&limit=200'),
      safeRows('/hr/employees?page=1&limit=200'),
      safeRows('/assets?page=1&limit=200')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const plans = extractRows(plansRes);
    const tasks = extractRows(tasksRes);
    const dependencies = extractRows(dependenciesRes);
    const snapshots = extractRows(snapshotsRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Scheduling</p>
          <h3>الخطط والمهام والاعتماديات والمسار الحرج في مساحة تشغيل واحدة</h3>
          <p class="muted">واجهة الجدولة الحالية تركز على التنفيذ والتحليل السريع للمسار الحرج وتأخير الموارد، مع إبقاء البيانات جاهزة للتوسعة لاحقًا.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title"><h3>قوائم العمل</h3><span class="muted">التأخير والمسار الحرج وتحميل الموارد</span></div>
          <div class="system-queue-list">${renderQueueList(queues, '/systems/scheduling')}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات الجدولة</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const sharedSections = `
      <section class="card">
        <div class="section-title"><h3>الرسوم والمؤشرات</h3><span class="muted">التقدم والمهام الحرجة والنظر للأمام</span></div>
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
          <div class="section-title"><h3>خطة زمنية جديدة</h3></div>
          <form id="scheduling-plan-form" class="grid-3">
            <div><label>المشروع</label><select id="scheduling-plan-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>البداية المرجعية</label><input id="scheduling-plan-baseline-start" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>النهاية المرجعية</label><input id="scheduling-plan-baseline-end" type="date" value="${toDateInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))}" /></div>
            <div><label>البداية الفعلية</label><input id="scheduling-plan-actual-start" type="date" /></div>
            <div><label>النهاية الفعلية</label><input id="scheduling-plan-actual-end" type="date" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان الخطة</label><input id="scheduling-plan-title" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="scheduling-plan-notes" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إنشاء الخطة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>الخطط الزمنية</h3></div>
          ${table(
            ['الكود', 'العنوان', 'المشروع', 'البداية المرجعية', 'النهاية المرجعية', 'الحالة'],
            plans.map((row) => [
              row.code,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              formatDate(row.baselineStart),
              formatDate(row.baselineEnd),
              statusBadge(row.status)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else if (mode === 'tasks') {
      const defaultAssignmentType = 'EMPLOYEE';
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>مهمة جديدة</h3></div>
          <form id="scheduling-task-form" class="grid-3">
            <div><label>الخطة</label><select id="scheduling-task-plan-id"><option value="">اختر الخطة</option>${plans.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>المشروع</label><select id="scheduling-task-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>WBS</label><input id="scheduling-task-wbs" /></div>
            <div><label>البداية</label><input id="scheduling-task-start" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>النهاية</label><input id="scheduling-task-end" type="date" value="${toDateInput(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000))}" /></div>
            <div><label>نسبة التقدم</label><input id="scheduling-task-progress" type="number" min="0" max="100" step="1" value="0" /></div>
            <div><label>نوع المورد</label><select id="scheduling-task-resource-type"><option value="EMPLOYEE">EMPLOYEE</option><option value="ASSET">ASSET</option></select></div>
            <div><label>المورد</label><select id="scheduling-task-resource-ref"><option value="">اختياري</option>${buildAssignmentOptions(defaultAssignmentType, employees, assets)}</select></div>
            <div><label>تحميل %</label><input id="scheduling-task-allocation" type="number" min="0" max="100" step="1" value="100" /></div>
            <div><label>كمية المورد</label><input id="scheduling-task-quantity" type="number" min="0" step="0.01" value="1" /></div>
            <div><label>حرجة</label><input id="scheduling-task-critical" type="checkbox" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان المهمة</label><input id="scheduling-task-title" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ المهمة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>المهام</h3></div>
          ${table(
            ['الخطة', 'المهمة', 'المشروع', 'المدة', 'التقدم', 'حرجة', 'الحالة'],
            tasks.map((row) => [
              escapeHtml(row.plan?.code || '-'),
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              `${formatDate(row.startDate)} - ${formatDate(row.endDate)}`,
              formatNumber(row.progressPercent || 0),
              row.isCritical ? statusBadge('CRITICAL') : statusBadge('NORMAL'),
              statusBadge(row.status)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>ربط اعتمادية</h3></div>
          <form id="scheduling-dependency-form" class="grid-3">
            <div><label>الخطة</label><select id="scheduling-dependency-plan-id"><option value="">اختر الخطة</option>${plans.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>المهمة السابقة</label><select id="scheduling-dependency-predecessor"><option value="">اختر المهمة</option>${tasks.map((row) => `<option value="${row.id}">${escapeHtml(row.title || row.wbsCode || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المهمة اللاحقة</label><select id="scheduling-dependency-successor"><option value="">اختر المهمة</option>${tasks.map((row) => `<option value="${row.id}">${escapeHtml(row.title || row.wbsCode || String(row.id))}</option>`).join('')}</select></div>
            <div><label>نوع الاعتمادية</label><select id="scheduling-dependency-type"><option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option><option value="SF">SF</option></select></div>
            <div><label>Lag أيام</label><input id="scheduling-dependency-lag" type="number" step="1" value="0" /></div>
            <div class="actions"><button class="btn btn-primary" type="submit">إضافة الاعتمادية</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>لقطة المسار الحرج</h3></div>
          <form id="scheduling-snapshot-form" class="grid-3">
            <div><label>الخطة</label><select id="scheduling-snapshot-plan-id"><option value="">اختر الخطة</option>${plans.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div style="grid-column:1 / -1;"><label>عنوان اللقطة</label><input id="scheduling-snapshot-title" value="Current Snapshot" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إنشاء اللقطة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>الاعتماديات</h3></div>
          ${table(
            ['الخطة', 'السابقة', 'اللاحقة', 'النوع', 'Lag'],
            dependencies.map((row) => [
              escapeHtml(row.plan?.code || '-'),
              escapeHtml(row.predecessorTask?.title || row.predecessorTask?.wbsCode || '-'),
              escapeHtml(row.successorTask?.title || row.successorTask?.wbsCode || '-'),
              statusBadge(row.dependencyType),
              formatNumber(row.lagDays || 0)
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>لقطات المسار الحرج</h3></div>
          ${table(
            ['الخطة', 'العنوان', 'التاريخ', 'المهام الحرجة', 'المتأخرة', 'الإجمالي'],
            snapshots.map((row) => [
              escapeHtml(row.plan?.code || '-'),
              escapeHtml(row.title || '-'),
              formatDate(row.snapshotDate),
              formatNumber(row.criticalTasksCount || 0),
              formatNumber(row.delayedTasksCount || 0),
              formatNumber(row.totalTasksCount || 0)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    }

    const resourceTypeElement = document.getElementById('scheduling-task-resource-type');
    const resourceRefElement = document.getElementById('scheduling-task-resource-ref');
    resourceTypeElement?.addEventListener('change', () => {
      if (!resourceRefElement) return;
      const type = resourceTypeElement.value || 'EMPLOYEE';
      resourceRefElement.innerHTML = `<option value="">اختياري</option>${buildAssignmentOptions(type, employees, assets)}`;
    });

    view.querySelectorAll('[data-nav]').forEach((element) => {
      element.addEventListener('click', () => {
        const path = element.getAttribute('data-nav');
        if (path) location.hash = path.startsWith('#') ? path : `#${path}`;
      });
    });

    document.getElementById('scheduling-plan-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('scheduling-plan-project-id').value || 0) || undefined,
        title: document.getElementById('scheduling-plan-title').value.trim(),
        baselineStart: document.getElementById('scheduling-plan-baseline-start').value || undefined,
        baselineEnd: document.getElementById('scheduling-plan-baseline-end').value || undefined,
        actualStart: document.getElementById('scheduling-plan-actual-start').value || undefined,
        actualEnd: document.getElementById('scheduling-plan-actual-end').value || undefined,
        notes: document.getElementById('scheduling-plan-notes').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان الخطة', 'warning');
        return;
      }
      await withToast(() => request('/scheduling/plans', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الخطة الزمنية');
      await load();
    });

    document.getElementById('scheduling-task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const resourceRefId = Number(document.getElementById('scheduling-task-resource-ref').value || 0) || undefined;
      const payload = {
        planId: Number(document.getElementById('scheduling-task-plan-id').value || 0) || undefined,
        projectId: Number(document.getElementById('scheduling-task-project-id').value || 0) || undefined,
        title: document.getElementById('scheduling-task-title').value.trim(),
        wbsCode: document.getElementById('scheduling-task-wbs').value.trim() || undefined,
        startDate: document.getElementById('scheduling-task-start').value || undefined,
        endDate: document.getElementById('scheduling-task-end').value || undefined,
        progressPercent: document.getElementById('scheduling-task-progress').value || undefined,
        isCritical: Boolean(document.getElementById('scheduling-task-critical').checked),
        assignments: resourceRefId
          ? [
              {
                resourceType: document.getElementById('scheduling-task-resource-type').value,
                resourceRefId,
                quantity: document.getElementById('scheduling-task-quantity').value || undefined,
                allocationPercent: document.getElementById('scheduling-task-allocation').value || undefined
              }
            ]
          : undefined
      };
      if (!payload.planId || !payload.title || !payload.startDate || !payload.endDate) {
        toast('أدخل الخطة والعنوان وتواريخ المهمة', 'warning');
        return;
      }
      await withToast(() => request('/scheduling/tasks', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المهمة');
      await load();
    });

    document.getElementById('scheduling-dependency-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        planId: Number(document.getElementById('scheduling-dependency-plan-id').value || 0) || undefined,
        predecessorTaskId: Number(document.getElementById('scheduling-dependency-predecessor').value || 0) || undefined,
        successorTaskId: Number(document.getElementById('scheduling-dependency-successor').value || 0) || undefined,
        dependencyType: document.getElementById('scheduling-dependency-type').value,
        lagDays: Number(document.getElementById('scheduling-dependency-lag').value || 0)
      };
      if (!payload.planId || !payload.predecessorTaskId || !payload.successorTaskId) {
        toast('أدخل الخطة والمهمتين قبل الربط', 'warning');
        return;
      }
      await withToast(() => request('/scheduling/dependencies', { method: 'POST', body: JSON.stringify(payload) }), 'تمت إضافة الاعتمادية');
      await load();
    });

    document.getElementById('scheduling-snapshot-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        planId: Number(document.getElementById('scheduling-snapshot-plan-id').value || 0) || undefined,
        title: document.getElementById('scheduling-snapshot-title').value.trim() || undefined
      };
      if (!payload.planId) {
        toast('اختر خطة قبل إنشاء اللقطة', 'warning');
        return;
      }
      await withToast(() => request('/scheduling/critical-path', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء لقطة المسار الحرج');
      await load();
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'plans' ? 'tasks' : mode === 'tasks' ? 'critical-path' : 'plans';
        location.hash = `#${routeForMode(nextMode)}`;
      },
      onSave: () => document.querySelector('form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
