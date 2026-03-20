import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';
import { renderActivityTable, renderAlertStack, renderChartBlocks, renderHeroCards, renderQueueList, safeRows, toDateInput } from './workspace-common.js';

function routeForMode(mode) {
  if (mode === 'ncr') return '/systems/quality/ncr';
  if (mode === 'incidents') return '/systems/quality/incidents';
  return '/systems/quality/inspections';
}

export async function renderQualityWorkspace(mode = 'inspections') {
  const titles = {
    inspections: 'الجودة والسلامة - الفحوصات والتصاريح',
    ncr: 'الجودة والسلامة - عدم المطابقة',
    incidents: 'الجودة والسلامة - الحوادث'
  };
  setTitle(titles[mode] || titles.inspections);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام الجودة والسلامة...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, inspectionsRes, ncrRes, incidentsRes, permitsRes, projects, employees] = await Promise.all([
      request('/quality/dashboard/summary'),
      request('/quality/dashboard/queues'),
      request('/quality/dashboard/alerts'),
      request('/quality/dashboard/activity'),
      request('/quality/dashboard/charts'),
      request('/quality/inspections?page=1&limit=100'),
      request('/quality/ncr?page=1&limit=100'),
      request('/quality/incidents?page=1&limit=100'),
      request('/quality/permits?page=1&limit=100'),
      safeRows('/projects?page=1&limit=200'),
      safeRows('/hr/employees?page=1&limit=200')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const inspections = extractRows(inspectionsRes);
    const ncrRows = extractRows(ncrRes);
    const incidents = extractRows(incidentsRes);
    const permits = extractRows(permitsRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Quality & Safety</p>
          <h3>فحوصات الجودة والحوادث والتصاريح من نفس مساحة العمل</h3>
          <p class="muted">اللوحة تعرض صف الاعتمادات والتنبيهات التشغيلية مباشرة مع ربط كامل بمركز الرقابة المركزي.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>قوائم العمل</h3>
            <span class="muted">الاعتماد والمتابعة والإغلاق</span>
          </div>
          <div class="system-queue-list">${renderQueueList(queues, '/systems/quality')}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات الجودة والسلامة</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const sharedSections = `
      <section class="card">
        <div class="section-title">
          <h3>الرسوم والمؤشرات</h3>
          <span class="muted">قراءة سريعة لأداء الجودة والسلامة</span>
        </div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${renderActivityTable(table, activity, statusBadge)}
      </section>
    `;

    if (mode === 'inspections') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إضافة فحص جديد</h3></div>
          <form id="quality-inspection-form" class="grid-3">
            <div><label>المشروع</label><select id="quality-inspection-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المفتش</label><select id="quality-inspection-employee-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>تاريخ الفحص</label><input id="quality-inspection-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>النتيجة</label><select id="quality-inspection-result"><option value="PENDING">Pending</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="CONDITIONAL">CONDITIONAL</option></select></div>
            <div><label>الشدة</label><select id="quality-inspection-severity"><option value="LOW">LOW</option><option value="MEDIUM" selected>MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></div>
            <div><label>الموقع</label><input id="quality-inspection-location" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان الفحص</label><input id="quality-inspection-title" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="quality-inspection-notes" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الفحص</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>تصريح عمل جديد</h3></div>
          <form id="quality-permit-form" class="grid-3">
            <div><label>المشروع</label><select id="quality-permit-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>النوع</label><input id="quality-permit-type" value="GENERAL" /></div>
            <div><label>المُصدر</label><select id="quality-permit-issuer-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>المُعتمد</label><select id="quality-permit-approver-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>من</label><input id="quality-permit-valid-from" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>إلى</label><input id="quality-permit-valid-to" type="date" value="${toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000))}" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان التصريح</label><input id="quality-permit-title" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إنشاء تصريح</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>دفتر الفحوصات</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'المشروع', 'التاريخ', 'الحالة', 'الاعتماد', 'الإجراءات'],
            inspections.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              formatDate(row.inspectionDate),
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">
                ${row.approvalStatus === 'DRAFT' ? `<button class="btn btn-info btn-sm" data-action="submit-inspection" data-id="${row.id}">إرسال</button>` : ''}
                ${row.approvalStatus === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve-inspection" data-id="${row.id}">اعتماد</button>` : ''}
              </div>`
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>التصاريح</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'المشروع', 'الصلاحية', 'الحالة', 'الاعتماد', 'الإجراءات'],
            permits.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              `${formatDate(row.validFrom)} - ${formatDate(row.validTo)}`,
              statusBadge(row.status),
              statusBadge(row.approvalStatus || 'DRAFT'),
              `<div class="actions">${row.approvalStatus !== 'APPROVED' ? `<button class="btn btn-success btn-sm" data-action="approve-permit" data-id="${row.id}">اعتماد</button>` : ''}</div>`
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else if (mode === 'ncr') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تسجيل NCR</h3></div>
          <form id="quality-ncr-form" class="grid-3">
            <div><label>المشروع</label><select id="quality-ncr-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الفحص</label><select id="quality-ncr-inspection-id"><option value="">اختياري</option>${inspections.map((row) => `<option value="${row.id}">${escapeHtml(row.number)}</option>`).join('')}</select></div>
            <div><label>الشدة</label><select id="quality-ncr-severity"><option value="LOW">LOW</option><option value="MEDIUM" selected>MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></div>
            <div><label>التاريخ</label><input id="quality-ncr-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="quality-ncr-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="quality-ncr-description" rows="2"></textarea></div>
            <div style="grid-column:1 / -1;"><label>الإجراء التصحيحي</label><textarea id="quality-ncr-action" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ NCR</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>تقارير عدم المطابقة</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'المشروع', 'الشدة', 'الحالة', 'الإجراء'],
            ncrRows.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              statusBadge(row.severity),
              statusBadge(row.status),
              `<div class="actions">${row.status !== 'CLOSED' ? `<button class="btn btn-success btn-sm" data-action="close-ncr" data-id="${row.id}">إغلاق</button>` : ''}</div>`
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تسجيل حادث سلامة</h3></div>
          <form id="quality-incident-form" class="grid-3">
            <div><label>المشروع</label><select id="quality-incident-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>التصريح</label><select id="quality-incident-permit-id"><option value="">اختياري</option>${permits.map((row) => `<option value="${row.id}">${escapeHtml(row.number)}</option>`).join('')}</select></div>
            <div><label>الشدة</label><select id="quality-incident-severity"><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH" selected>HIGH</option><option value="CRITICAL">CRITICAL</option></select></div>
            <div><label>التاريخ</label><input id="quality-incident-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="quality-incident-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="quality-incident-description" rows="2"></textarea></div>
            <div style="grid-column:1 / -1;"><label>السبب الجذري</label><textarea id="quality-incident-root-cause" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الحادث</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>الحوادث المفتوحة</h3></div>
          ${table(
            ['الرقم', 'العنوان', 'المشروع', 'الشدة', 'الحالة', 'الإجراء'],
            incidents.map((row) => [
              row.number,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              statusBadge(row.severity),
              statusBadge(row.status),
              `<div class="actions">${row.status !== 'RESOLVED' ? `<button class="btn btn-success btn-sm" data-action="resolve-incident" data-id="${row.id}">حل</button>` : ''}</div>`
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

    document.getElementById('quality-inspection-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('quality-inspection-project-id').value || 0) || undefined,
        inspectorEmployeeId: Number(document.getElementById('quality-inspection-employee-id').value || 0) || undefined,
        inspectionDate: document.getElementById('quality-inspection-date').value || undefined,
        result: document.getElementById('quality-inspection-result').value,
        severity: document.getElementById('quality-inspection-severity').value,
        location: document.getElementById('quality-inspection-location').value.trim() || undefined,
        title: document.getElementById('quality-inspection-title').value.trim(),
        notes: document.getElementById('quality-inspection-notes').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان الفحص قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/quality/inspections', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الفحص');
      await load();
    });

    document.getElementById('quality-permit-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('quality-permit-project-id').value || 0) || undefined,
        permitType: document.getElementById('quality-permit-type').value.trim() || 'GENERAL',
        issuerEmployeeId: Number(document.getElementById('quality-permit-issuer-id').value || 0) || undefined,
        approverEmployeeId: Number(document.getElementById('quality-permit-approver-id').value || 0) || undefined,
        validFrom: document.getElementById('quality-permit-valid-from').value || undefined,
        validTo: document.getElementById('quality-permit-valid-to').value || undefined,
        title: document.getElementById('quality-permit-title').value.trim()
      };
      if (!payload.title || !payload.validFrom || !payload.validTo) {
        toast('أدخل عنوان التصريح وفترة الصلاحية', 'warning');
        return;
      }
      await withToast(() => request('/quality/permits', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء التصريح');
      await load();
    });

    document.getElementById('quality-ncr-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('quality-ncr-project-id').value || 0) || undefined,
        inspectionId: Number(document.getElementById('quality-ncr-inspection-id').value || 0) || undefined,
        reportDate: document.getElementById('quality-ncr-date').value || undefined,
        severity: document.getElementById('quality-ncr-severity').value,
        title: document.getElementById('quality-ncr-title').value.trim(),
        description: document.getElementById('quality-ncr-description').value.trim() || undefined,
        correctiveAction: document.getElementById('quality-ncr-action').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان التقرير', 'warning');
        return;
      }
      await withToast(() => request('/quality/ncr', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء تقرير عدم المطابقة');
      await load();
    });

    document.getElementById('quality-incident-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('quality-incident-project-id').value || 0) || undefined,
        permitId: Number(document.getElementById('quality-incident-permit-id').value || 0) || undefined,
        incidentDate: document.getElementById('quality-incident-date').value || undefined,
        severity: document.getElementById('quality-incident-severity').value,
        title: document.getElementById('quality-incident-title').value.trim(),
        description: document.getElementById('quality-incident-description').value.trim() || undefined,
        rootCause: document.getElementById('quality-incident-root-cause').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان الحادث', 'warning');
        return;
      }
      await withToast(() => request('/quality/incidents', { method: 'POST', body: JSON.stringify(payload) }), 'تم تسجيل الحادث');
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'submit-inspection') {
          await withToast(() => request(`/quality/inspections/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }), 'تم إرسال الفحص');
          await load();
          return;
        }
        if (action === 'approve-inspection') {
          await withToast(() => request(`/quality/inspections/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }), 'تم اعتماد الفحص');
          await load();
          return;
        }
        if (action === 'approve-permit') {
          await withToast(() => request(`/quality/permits/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }), 'تم اعتماد التصريح');
          await load();
          return;
        }
        if (action === 'close-ncr') {
          const accepted = await confirmAction('هل تريد إغلاق تقرير عدم المطابقة؟');
          if (!accepted) return;
          await withToast(() => request(`/quality/ncr/${id}/close`, { method: 'POST', body: JSON.stringify({}) }), 'تم إغلاق التقرير');
          await load();
          return;
        }
        if (action === 'resolve-incident') {
          const accepted = await confirmAction('هل تريد إغلاق الحادث كمحلول؟');
          if (!accepted) return;
          await withToast(() => request(`/quality/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) }), 'تم حل الحادث');
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'inspections' ? 'ncr' : mode === 'ncr' ? 'incidents' : 'inspections';
        location.hash = `#${routeForMode(nextMode)}`;
      },
      onSave: () => document.querySelector('form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
