import { extractRows, request, withToast } from '../core/api.js';
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
        <button class="system-queue-item" type="button" data-nav="${item.route || '/systems/site-ops'}">
          <span>${item.label}</span>
          <strong>${formatNumber(item.count)}</strong>
        </button>
      `
    )
    .join('');
}

async function safeRows(path) {
  try {
    return extractRows(await request(path));
  } catch {
    return [];
  }
}

function toDateInput(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function routeForMode(mode) {
  if (mode === 'materials') return '/systems/site-ops/materials';
  if (mode === 'attendance') return '/systems/site-ops/attendance';
  if (mode === 'issues') return '/systems/site-ops/issues';
  return '/systems/site-ops/daily';
}

export async function renderSiteOpsWorkspace(mode = 'daily') {
  const modeTitles = {
    daily: 'التشغيل الميداني - اليومية',
    materials: 'التشغيل الميداني - طلبات المواد',
    attendance: 'التشغيل الميداني - الحضور الميداني',
    issues: 'التشغيل الميداني - المشاكل الميدانية'
  };
  setTitle(modeTitles[mode] || modeTitles.daily);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام التشغيل الميداني...</div>';

  const state = {
    daily: { projectId: '', logDate: '', weather: '', workforceCount: '', workExecuted: '', blockers: '' },
    material: { projectId: '', dailyLogId: '', itemId: '', warehouseId: '', quantity: '', requiredBy: '', purpose: '' },
    attendance: { projectId: '', employeeId: '', date: '', checkIn: '', checkOut: '', hoursWorked: '', status: 'PRESENT' },
    issue: { projectId: '', dailyLogId: '', severity: 'MEDIUM', title: '', description: '', dueDate: '' }
  };

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, dailyRes, materialRes, attendanceRes, issuesRes, projects, employees, items, warehouses] = await Promise.all([
      request('/site-ops/dashboard/summary'),
      request('/site-ops/dashboard/queues'),
      request('/site-ops/dashboard/alerts'),
      request('/site-ops/dashboard/activity'),
      request('/site-ops/dashboard/charts'),
      request('/site-ops/daily-logs?page=1&limit=100'),
      request('/site-ops/material-requests?page=1&limit=100'),
      request('/site-ops/attendance?page=1&limit=100'),
      request('/site-ops/issues?page=1&limit=100'),
      safeRows('/projects?page=1&limit=200'),
      safeRows('/hr/employees?page=1&limit=200'),
      safeRows('/items?page=1&limit=200'),
      safeRows('/warehouses?page=1&limit=200')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const dailyLogs = extractRows(dailyRes);
    const materialRequests = extractRows(materialRes);
    const attendanceRows = extractRows(attendanceRes);
    const issueRows = extractRows(issuesRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Site Operations</p>
          <h3>إدارة التشغيل الميداني من الواجهة الموحدة</h3>
          <p class="muted">نفس لوحة النظام تعرض مؤشرات اليوميات والمواد والحضور والمشاكل مع تكامل مباشر مع المخزون والموارد البشرية والمشاريع.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>

      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>قوائم العمل</h3>
            <span class="muted">اعتمادات وتشغيل يومي</span>
          </div>
          <div class="system-queue-list">${renderQueueList(queues)}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات وتشغيل</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const baseSections = `
      <section class="card">
        <div class="section-title">
          <h3>الرسوم والمؤشرات</h3>
          <span class="muted">صورة فورية لأداء التشغيل</span>
        </div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${table(['العنصر', 'الوصف', 'التاريخ', 'الحالة'], activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), statusBadge(item.status)]))}
      </section>
    `;

    if (mode === 'daily') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إنشاء يومية ميدانية</h3></div>
          <form id="site-daily-form" class="grid-3">
            <div><label>المشروع</label><select id="site-daily-project-id"><option value="">اختر المشروع</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>التاريخ</label><input id="site-daily-log-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>الطقس</label><input id="site-daily-weather" /></div>
            <div><label>عدد العمالة</label><input id="site-daily-workforce" type="number" min="0" step="1" /></div>
            <div style="grid-column:1 / -1;"><label>الأعمال المنفذة</label><textarea id="site-daily-work-executed" rows="2"></textarea></div>
            <div style="grid-column:1 / -1;"><label>المعوقات</label><textarea id="site-daily-blockers" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ اليومية</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>دفتر اليوميات</h3></div>
          ${table(
            ['الرقم', 'المشروع', 'التاريخ', 'العمالة', 'الحالة', 'الاعتماد', 'الإجراءات'],
            dailyLogs.map((row) => [
              row.number,
              row.project?.nameAr || '-',
              formatDate(row.logDate),
              formatNumber(row.workforceCount || 0),
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit-daily" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve-daily" data-id="${row.id}">اعتماد</button>` : ''}
              </div>`
            ])
          )}
        </section>
        ${baseSections}
      `;
    } else if (mode === 'materials') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>طلب مواد جديد</h3></div>
          <form id="site-material-form" class="grid-3">
            <div><label>المشروع</label><select id="site-material-project-id"><option value="">اختر المشروع</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>اليومية المرتبطة</label><select id="site-material-daily-id"><option value="">اختياري</option>${dailyLogs.map((row) => `<option value="${row.id}">${escapeHtml(row.number)}</option>`).join('')}</select></div>
            <div><label>الصنف</label><select id="site-material-item-id"><option value="">اختر الصنف</option>${items.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المستودع</label><select id="site-material-warehouse-id"><option value="">اختر المستودع</option>${warehouses.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الكمية</label><input id="site-material-qty" type="number" min="0.01" step="0.01" /></div>
            <div><label>مطلوب قبل</label><input id="site-material-required-by" type="date" /></div>
            <div style="grid-column:1 / -1;"><label>الغرض</label><textarea id="site-material-purpose" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الطلب</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>طلبات المواد</h3></div>
          ${table(
            ['الرقم', 'المشروع', 'الصنف', 'الكمية', 'المصروف', 'الحالة', 'الاعتماد', 'الإجراءات'],
            materialRequests.map((row) => [
              row.number,
              row.project?.nameAr || '-',
              row.item?.nameAr || '-',
              formatNumber(row.quantity || 0),
              formatNumber(row.issuedQuantity || 0),
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.status === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit-material" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve-material" data-id="${row.id}">اعتماد</button>` : ''}
                ${row.approvalStatus === 'APPROVED' && row.status !== 'FULFILLED' ? `<button class="btn btn-primary btn-sm" data-action="fulfill-material" data-id="${row.id}">صرف</button>` : ''}
              </div>`
            ])
          )}
        </section>
        ${baseSections}
      `;
    } else if (mode === 'attendance') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تسجيل حضور ميداني</h3></div>
          <form id="site-attendance-form" class="grid-3">
            <div><label>المشروع</label><select id="site-attendance-project-id"><option value="">اختر المشروع</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الموظف</label><select id="site-attendance-employee-id"><option value="">اختر الموظف</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>التاريخ</label><input id="site-attendance-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>الدخول</label><input id="site-attendance-check-in" type="datetime-local" /></div>
            <div><label>الخروج</label><input id="site-attendance-check-out" type="datetime-local" /></div>
            <div><label>ساعات العمل</label><input id="site-attendance-hours" type="number" min="0" step="0.25" /></div>
            <div><label>الحالة</label><select id="site-attendance-status"><option value="PRESENT">حاضر</option><option value="ABSENT">غائب</option><option value="LATE">متأخر</option></select></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الحضور</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>دفتر الحضور الميداني</h3></div>
          ${table(
            ['الموظف', 'المشروع', 'التاريخ', 'الساعات', 'الحالة', 'الاعتماد', 'الإجراءات'],
            attendanceRows.map((row) => [
              row.employee?.fullName || '-',
              row.project?.nameAr || '-',
              formatDate(row.date),
              formatNumber(row.hoursWorked || 0),
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.approvalStatus === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit-attendance" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve-attendance" data-id="${row.id}">اعتماد</button>` : ''}
              </div>`
            ])
          )}
        </section>
        ${baseSections}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تسجيل مشكلة ميدانية</h3></div>
          <form id="site-issue-form" class="grid-3">
            <div><label>المشروع</label><select id="site-issue-project-id"><option value="">اختر المشروع</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>اليومية المرتبطة</label><select id="site-issue-daily-id"><option value="">اختياري</option>${dailyLogs.map((row) => `<option value="${row.id}">${escapeHtml(row.number)}</option>`).join('')}</select></div>
            <div><label>الخطورة</label><select id="site-issue-severity"><option value="LOW">منخفض</option><option value="MEDIUM" selected>متوسط</option><option value="HIGH">مرتفع</option><option value="CRITICAL">حرج</option></select></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="site-issue-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="site-issue-description" rows="3"></textarea></div>
            <div><label>تاريخ الاستحقاق</label><input id="site-issue-due-date" type="date" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ المشكلة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>سجل المشاكل الميدانية</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'المشروع', 'الخطورة', 'الحالة', 'التاريخ', 'الإجراءات'],
            issueRows.map((row) => [
              row.number,
              row.title,
              row.project?.nameAr || '-',
              statusBadge(row.severity),
              statusBadge(row.status),
              formatDate(row.issueDate),
              `<div class="actions">
                ${row.status !== 'RESOLVED' ? `<button class="btn btn-success btn-sm" data-action="resolve-issue" data-id="${row.id}">حل</button>` : ''}
              </div>`
            ])
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

    document.getElementById('site-daily-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('site-daily-project-id').value || 0) || undefined,
        logDate: document.getElementById('site-daily-log-date').value || undefined,
        weather: document.getElementById('site-daily-weather').value.trim() || undefined,
        workforceCount: document.getElementById('site-daily-workforce').value || 0,
        workExecuted: document.getElementById('site-daily-work-executed').value.trim() || undefined,
        blockers: document.getElementById('site-daily-blockers').value.trim() || undefined
      };
      if (!payload.projectId || !payload.logDate) {
        toast('اختر المشروع والتاريخ قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/site-ops/daily-logs', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء اليومية الميدانية');
      await load();
    });

    document.getElementById('site-material-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('site-material-project-id').value || 0) || undefined,
        dailyLogId: Number(document.getElementById('site-material-daily-id').value || 0) || undefined,
        itemId: Number(document.getElementById('site-material-item-id').value || 0) || undefined,
        warehouseId: Number(document.getElementById('site-material-warehouse-id').value || 0) || undefined,
        quantity: document.getElementById('site-material-qty').value || 0,
        requiredBy: document.getElementById('site-material-required-by').value || undefined,
        purpose: document.getElementById('site-material-purpose').value.trim() || undefined
      };
      if (!payload.projectId || Number(payload.quantity || 0) <= 0) {
        toast('حدد المشروع والكمية قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/site-ops/material-requests', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء طلب المواد');
      await load();
    });

    document.getElementById('site-attendance-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('site-attendance-project-id').value || 0) || undefined,
        employeeId: Number(document.getElementById('site-attendance-employee-id').value || 0) || undefined,
        date: document.getElementById('site-attendance-date').value || undefined,
        checkIn: document.getElementById('site-attendance-check-in').value || undefined,
        checkOut: document.getElementById('site-attendance-check-out').value || undefined,
        hoursWorked: document.getElementById('site-attendance-hours').value || undefined,
        status: document.getElementById('site-attendance-status').value || 'PRESENT'
      };
      if (!payload.projectId || !payload.employeeId || !payload.date) {
        toast('اختر المشروع والموظف والتاريخ', 'warning');
        return;
      }
      await withToast(() => request('/site-ops/attendance', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ الحضور الميداني');
      await load();
    });

    document.getElementById('site-issue-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('site-issue-project-id').value || 0) || undefined,
        dailyLogId: Number(document.getElementById('site-issue-daily-id').value || 0) || undefined,
        severity: document.getElementById('site-issue-severity').value || 'MEDIUM',
        title: document.getElementById('site-issue-title').value.trim(),
        description: document.getElementById('site-issue-description').value.trim() || undefined,
        dueDate: document.getElementById('site-issue-due-date').value || undefined
      };
      if (!payload.projectId || !payload.title) {
        toast('حدد المشروع وأدخل عنوان المشكلة', 'warning');
        return;
      }
      await withToast(() => request('/site-ops/issues', { method: 'POST', body: JSON.stringify(payload) }), 'تم تسجيل المشكلة الميدانية');
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'submit-daily') {
          await withToast(() => request(`/site-ops/daily-logs/${id}/submit`, { method: 'POST' }), 'تم إرسال اليومية');
          await load();
          return;
        }
        if (action === 'approve-daily') {
          await withToast(() => request(`/site-ops/daily-logs/${id}/approve`, { method: 'POST' }), 'تم اعتماد اليومية');
          await load();
          return;
        }
        if (action === 'submit-material') {
          await withToast(() => request(`/site-ops/material-requests/${id}/submit`, { method: 'POST' }), 'تم إرسال الطلب');
          await load();
          return;
        }
        if (action === 'approve-material') {
          await withToast(() => request(`/site-ops/material-requests/${id}/approve`, { method: 'POST' }), 'تم اعتماد الطلب');
          await load();
          return;
        }
        if (action === 'fulfill-material') {
          const qty = window.prompt('أدخل الكمية المصروفة:', '0');
          if (qty === null) return;
          await withToast(
            () =>
              request(`/site-ops/material-requests/${id}/fulfill`, {
                method: 'POST',
                body: JSON.stringify({ issuedQuantity: Number(qty || 0) })
              }),
            'تم صرف المواد'
          );
          await load();
          return;
        }
        if (action === 'submit-attendance') {
          await withToast(() => request(`/site-ops/attendance/${id}/submit`, { method: 'POST' }), 'تم إرسال سجل الحضور');
          await load();
          return;
        }
        if (action === 'approve-attendance') {
          await withToast(() => request(`/site-ops/attendance/${id}/approve`, { method: 'POST' }), 'تم اعتماد سجل الحضور');
          await load();
          return;
        }
        if (action === 'resolve-issue') {
          const accepted = await confirmAction('هل تريد إغلاق المشكلة كمحلولة؟');
          if (!accepted) return;
          await withToast(() => request(`/site-ops/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) }), 'تم حل المشكلة');
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'daily' ? 'materials' : mode === 'materials' ? 'attendance' : mode === 'attendance' ? 'issues' : 'daily';
        location.hash = `#${routeForMode(nextMode)}`;
      },
      onSave: () => {
        const form = document.querySelector('form');
        form?.requestSubmit();
      },
      onSearch: null,
      onRefresh: () => load()
    });
  };

  await load();
}
