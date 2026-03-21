import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';
import { renderActivityTable, renderAlertStack, renderChartBlocks, renderHeroCards, renderQueueList, safeRows } from './workspace-common.js';

function routeForMode(mode) {
  if (mode === 'notifications') return '/systems/control-center/notifications';
  if (mode === 'tasks') return '/systems/control-center/tasks';
  if (mode === 'governance') return '/systems/control-center/governance';
  return '/systems/control-center/approvals';
}

function nextMode(mode) {
  if (mode === 'approvals') return 'notifications';
  if (mode === 'notifications') return 'tasks';
  if (mode === 'tasks') return 'governance';
  return 'approvals';
}

function renderUserOptions(users, selectedUserId) {
  return users
    .map((user) => {
      const label = escapeHtml(user.fullName || user.username || String(user.id));
      const selected = Number(user.id) === Number(selectedUserId) ? ' selected' : '';
      return `<option value="${user.id}"${selected}>${label}</option>`;
    })
    .join('');
}

function renderHeader(summary, queues, alerts) {
  return `
    <section class="workflow-hero card">
      <div>
        <p class="dash-overline">Control Center</p>
        <h3>الموافقات الموحدة والتنبيهات والحوكمة من نظام واحد</h3>
        <p class="muted">مركز الرقابة يجمع المهام والإشعارات والأحداث الحية ويعيد توجيه المستخدم مباشرة إلى النظام المصدر عند الحاجة.</p>
      </div>
      <div class="workflow-kpis">${renderHeroCards(summary)}</div>
    </section>
    <section class="workflow-grid">
      <article class="card workflow-main">
        <div class="section-title">
          <h3>صفوف العمل</h3>
          <span class="muted">التنقل السريع إلى الاعتمادات والقوائم الحرجة</span>
        </div>
        <div class="system-queue-list">${renderQueueList(queues, '/systems/control-center/approvals')}</div>
      </article>
      <aside class="card workflow-side">
        <h3>تنبيهات مركزية</h3>
        <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
      </aside>
    </section>
  `;
}

function renderFooter(charts, activity) {
  return `
    <section class="card">
      <div class="section-title">
        <h3>المؤشرات التنفيذية</h3>
        <span class="muted">تلخيص تشغيلي عبر الأنظمة</span>
      </div>
      ${renderChartBlocks(charts)}
    </section>
    <section class="card">
      <div class="section-title"><h3>آخر النشاط</h3></div>
      ${renderActivityTable(table, activity, statusBadge)}
    </section>
  `;
}

function bindNavigation(root) {
  root.querySelectorAll('[data-nav]').forEach((element) => {
    element.addEventListener('click', () => {
      const path = element.getAttribute('data-nav');
      if (path) location.hash = path.startsWith('#') ? path : `#${path}`;
    });
  });
}

export async function renderControlCenterWorkspace(mode = 'approvals') {
  const titles = {
    approvals: 'مركز الرقابة المركزي - صندوق الاعتمادات',
    notifications: 'مركز الرقابة المركزي - الإشعارات',
    tasks: 'مركز الرقابة المركزي - المهام',
    governance: 'مركز الرقابة المركزي - الحوكمة'
  };

  setTitle(titles[mode] || titles.approvals);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مركز الرقابة المركزي...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, approvalsRes, notificationsRes, tasksRes, branches, workflows, liveEventsRes, users] =
      await Promise.all([
        request('/control-center/dashboard/summary'),
        request('/control-center/dashboard/queues'),
        request('/control-center/dashboard/alerts'),
        request('/control-center/dashboard/activity'),
        request('/control-center/dashboard/charts'),
        request('/control-center/approval-requests?limit=100'),
        request('/control-center/notifications?page=1&limit=100'),
        request('/control-center/tasks?page=1&limit=100'),
        safeRows('/control-center/branches'),
        safeRows('/control-center/approval-workflows'),
        request('/control-center/events/live?page=1&limit=50'),
        safeRows('/users')
      ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const approvals = extractRows(approvalsRes);
    const notifications = extractRows(notificationsRes);
    const tasks = extractRows(tasksRes);
    const liveEvents = extractRows(liveEventsRes);

    const header = renderHeader(summary, queues, alerts);
    const footer = renderFooter(charts, activity);

    if (mode === 'approvals') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title">
            <h3>الاعتمادات المعلقة</h3>
            <span class="muted">عرض موحد مع روابط مباشرة للأنظمة المصدر</span>
          </div>
          ${table(
            ['النوع', 'المستند', 'السياق', 'الحالة', 'الاعتماد', 'القيمة', 'آخر تحديث'],
            approvals.map((row) => [
              escapeHtml(row.type || '-'),
              `<button class="btn btn-secondary btn-sm" type="button" data-nav="${row.route || '/systems/control-center/approvals'}">${escapeHtml(
                [row.number, row.title].filter(Boolean).join(' - ')
              )}</button>`,
              escapeHtml(row.contextLabel || '-'),
              statusBadge(row.status || 'PENDING'),
              statusBadge(row.approvalStatus || 'PENDING'),
              row.amount == null ? '-' : escapeHtml(String(row.amount)),
              formatDate(row.updatedAt || row.createdAt)
            ])
          )}
        </section>
        ${footer}
      `;
    } else if (mode === 'notifications') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title">
            <h3>الإشعارات</h3>
            <div class="actions">
              <button class="btn btn-primary btn-sm" type="button" id="control-read-all">تعليم الكل كمقروء</button>
            </div>
          </div>
          ${table(
            ['العنوان', 'الرسالة', 'النوع', 'الحالة', 'التاريخ', 'الإجراء'],
            notifications.map((row) => [
              escapeHtml(row.title || '-'),
              escapeHtml(row.message || '-'),
              escapeHtml(row.type || '-'),
              statusBadge(row.isRead ? 'COMPLETED' : 'PENDING'),
              formatDate(row.createdAt),
              row.isRead
                ? '-'
                : `<button class="btn btn-success btn-sm" type="button" data-action="mark-read" data-id="${row.id}">تمت القراءة</button>`
            ])
          )}
        </section>
        ${footer}
      `;
    } else if (mode === 'tasks') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title">
            <h3>المهام</h3>
            <span class="muted">إسناد ومتابعة وإنهاء من نفس الصفحة</span>
          </div>
          ${table(
            ['العنوان', 'الوصف', 'الموعد', 'الأولوية', 'الحالة', 'المسؤول', 'الإجراءات'],
            tasks.map((row) => [
              escapeHtml(row.title || '-'),
              escapeHtml(row.description || '-'),
              formatDate(row.dueDate),
              escapeHtml(row.priority || '-'),
              statusBadge(row.status || 'OPEN'),
              `
                <select data-task-user="${row.id}">
                  <option value="">غير مسندة</option>
                  ${renderUserOptions(users, row.assignee?.id)}
                </select>
              `,
              `
                <div class="actions">
                  <button class="btn btn-info btn-sm" type="button" data-action="assign-task" data-id="${row.id}">إسناد</button>
                  ${row.status !== 'DONE' ? `<button class="btn btn-success btn-sm" type="button" data-action="task-done" data-id="${row.id}">إنهاء</button>` : ''}
                </div>
              `
            ])
          )}
        </section>
        ${footer}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="workflow-grid">
          <article class="card workflow-main">
            <div class="section-title">
              <h3>الفروع</h3>
              <span class="muted">المرجعيات المشتركة</span>
            </div>
            ${table(
              ['الكود', 'الاسم', 'الحالة'],
              branches.map((row) => [escapeHtml(row.code || '-'), escapeHtml(row.nameAr || '-'), statusBadge(row.isActive ? 'ACTIVE' : 'CLOSED')])
            )}
          </article>
          <aside class="card workflow-side">
            <div class="section-title">
              <h3>مسارات الموافقة</h3>
              <span class="muted">مراقبة السياسات الفعالة</span>
            </div>
            ${table(
              ['الكود', 'الكيان', 'الفرع', 'الحالة'],
              workflows.map((row) => [
                escapeHtml(row.code || '-'),
                escapeHtml(row.entityType || '-'),
                escapeHtml(row.branchId == null ? '-' : String(row.branchId)),
                statusBadge(row.isActive ? 'ACTIVE' : 'CLOSED')
              ])
            )}
          </aside>
        </section>
        <section class="card">
          <div class="section-title">
            <h3>الأحداث الحية</h3>
            <span class="muted">آخر أحداث الـoutbox المنشورة والمعلقة</span>
          </div>
          ${table(
            ['الحدث', 'الكيان', 'المعرف', 'الحالة', 'الفرع', 'التاريخ'],
            liveEvents.map((row) => [
              escapeHtml(row.eventType || '-'),
              escapeHtml(row.aggregateType || '-'),
              escapeHtml(String(row.aggregateId || '-')),
              statusBadge(row.status || 'PENDING'),
              escapeHtml(row.branchId == null ? '-' : String(row.branchId)),
              formatDate(row.occurredAt || row.createdAt)
            ])
          )}
        </section>
        ${footer}
      `;
    }

    bindNavigation(view);

    document.getElementById('control-read-all')?.addEventListener('click', async () => {
      await withToast(() => request('/control-center/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }), 'تم تعليم كل الإشعارات كمقروءة');
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'mark-read') {
          await withToast(() => request(`/control-center/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) }), 'تم تحديث الإشعار');
          await load();
          return;
        }

        if (action === 'assign-task') {
          const assigneeSelect = view.querySelector(`[data-task-user="${id}"]`);
          const userId = Number(assigneeSelect?.value || 0) || null;
          await withToast(
            () =>
              request(`/control-center/tasks/${id}/assign`, {
                method: 'POST',
                body: JSON.stringify({ userId })
              }),
            'تم تحديث المسؤول'
          );
          await load();
          return;
        }

        if (action === 'task-done') {
          const accepted = await confirmAction('هل تريد تعليم المهمة كمكتملة؟');
          if (!accepted) return;
          await withToast(
            () =>
              request(`/control-center/tasks/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'DONE' })
              }),
            'تم إغلاق المهمة'
          );
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => {
        location.hash = `#${routeForMode(nextMode(mode))}`;
      },
      onSave: mode === 'notifications' ? () => document.getElementById('control-read-all')?.click() : null,
      onRefresh: () => load()
    });
  };

  await load().catch((error) => {
    view.innerHTML = `<div class="card">تعذر تحميل مركز الرقابة المركزي: ${escapeHtml(error.message || 'خطأ غير معروف')}</div>`;
    toast(error.message || 'تعذر تحميل مركز الرقابة المركزي', 'error');
  });
}
