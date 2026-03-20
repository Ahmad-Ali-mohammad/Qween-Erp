import { extractRows, request, withToast } from '../core/api.js';
import { formatDate, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
import { escapeHtml } from '../flows/commercial/document-workspace.js';
import { renderActivityTable, renderAlertStack, renderChartBlocks, renderHeroCards, renderQueueList, safeRows, toDateInput } from './workspace-common.js';

function routeForMode(mode) {
  if (mode === 'heatmap') return '/systems/risk/heatmap';
  if (mode === 'followup') return '/systems/risk/followup';
  return '/systems/risk/register';
}

export async function renderRiskWorkspace(mode = 'register') {
  const titles = {
    register: 'إدارة المخاطر - سجل المخاطر',
    heatmap: 'إدارة المخاطر - التقييم والحرارة',
    followup: 'إدارة المخاطر - التخفيف والمتابعة'
  };
  setTitle(titles[mode] || titles.register);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام إدارة المخاطر...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, registerRes, assessmentsRes, mitigationsRes, followupsRes, projects, employees] = await Promise.all([
      request('/risk/dashboard/summary'),
      request('/risk/dashboard/queues'),
      request('/risk/dashboard/alerts'),
      request('/risk/dashboard/activity'),
      request('/risk/dashboard/charts'),
      request('/risk/register?page=1&limit=100'),
      request('/risk/assessments?page=1&limit=100'),
      request('/risk/mitigations?page=1&limit=100'),
      request('/risk/followup?page=1&limit=100'),
      safeRows('/projects?page=1&limit=200'),
      safeRows('/hr/employees?page=1&limit=200')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const risks = extractRows(registerRes);
    const assessments = extractRows(assessmentsRes);
    const mitigations = extractRows(mitigationsRes);
    const followups = extractRows(followupsRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Risk</p>
          <h3>من سجل الخطر حتى التقييم والتخفيف والمتابعة في لوحة واحدة</h3>
          <p class="muted">الواجهة تركّز على المخاطر الحرجة والتخفيفات المتأخرة مع ربط مباشر بمركز الرقابة المركزي.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title"><h3>قوائم العمل</h3><span class="muted">مخاطر مفتوحة وتخفيفات تستحق المتابعة</span></div>
          <div class="system-queue-list">${renderQueueList(queues, '/systems/risk')}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات المخاطر</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const sharedSections = `
      <section class="card">
        <div class="section-title"><h3>الرسوم والمؤشرات</h3><span class="muted">شدة، فئات، وتعريض تراكمي</span></div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${renderActivityTable(table, activity, statusBadge)}
      </section>
    `;

    if (mode === 'register') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>سجل خطر جديد</h3></div>
          <form id="risk-register-form" class="grid-3">
            <div><label>المشروع</label><select id="risk-project-id"><option value="">اختياري</option>${projects.map((row) => `<option value="${row.id}">${escapeHtml(row.nameAr || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>مالك الخطر</label><select id="risk-owner-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>الفئة</label><select id="risk-category"><option value="GENERAL">GENERAL</option><option value="FINANCIAL">FINANCIAL</option><option value="OPERATIONAL">OPERATIONAL</option><option value="SAFETY">SAFETY</option><option value="COMPLIANCE">COMPLIANCE</option></select></div>
            <div><label>العقد (ID)</label><input id="risk-contract-id" type="number" min="1" step="1" /></div>
            <div><label>الإدارة (ID)</label><input id="risk-department-id" type="number" min="1" step="1" /></div>
            <div><label>تاريخ الاستحقاق</label><input id="risk-due-date" type="date" value="${toDateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}" /></div>
            <div><label>الاحتمالية</label><input id="risk-probability" type="number" min="0" step="0.01" value="4" /></div>
            <div><label>الأثر</label><input id="risk-impact" type="number" min="0" step="0.01" value="5" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان الخطر</label><input id="risk-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="risk-description" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إضافة الخطر</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>سجل المخاطر</h3></div>
          ${table(
            ['الكود', 'العنوان', 'المشروع', 'المالك', 'الشدة', 'التعرّض', 'الحالة'],
            risks.map((row) => [
              row.code,
              escapeHtml(row.title || '-'),
              escapeHtml(row.project?.nameAr || '-'),
              escapeHtml(row.ownerEmployee?.fullName || '-'),
              statusBadge(row.severity),
              formatNumber(row.exposure || 0),
              statusBadge(row.status)
            ])
          )}
        </section>
        ${sharedSections}
      `;
    } else if (mode === 'heatmap') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>تقييم خطر</h3></div>
          <form id="risk-assessment-form" class="grid-3">
            <div><label>الخطر</label><select id="risk-assessment-risk-id"><option value="">اختر الخطر</option>${risks.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>التاريخ</label><input id="risk-assessment-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>الاحتمالية</label><input id="risk-assessment-probability" type="number" min="0" step="0.01" value="4" /></div>
            <div><label>الأثر</label><input id="risk-assessment-impact" type="number" min="0" step="0.01" value="5" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="risk-assessment-notes" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ التقييم</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>آخر التقييمات</h3></div>
          ${table(
            ['الخطر', 'التاريخ', 'الاحتمالية', 'الأثر', 'التعرّض', 'الشدة'],
            assessments.map((row) => [
              escapeHtml(row.risk?.title || row.risk?.code || '-'),
              formatDate(row.assessmentDate),
              formatNumber(row.probability || 0),
              formatNumber(row.impact || 0),
              formatNumber(row.exposure || 0),
              statusBadge(row.severity)
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>قراءة حرارية سريعة</h3></div>
          ${table(
            ['الخطر', 'الفئة', 'الاستحقاق', 'التعرّض', 'الشدة', 'الحالة'],
            risks.map((row) => [
              escapeHtml(row.title || '-'),
              escapeHtml(row.category || '-'),
              formatDate(row.dueDate),
              formatNumber(row.exposure || 0),
              statusBadge(row.severity),
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
          <div class="section-title"><h3>خطة تخفيف</h3></div>
          <form id="risk-mitigation-form" class="grid-3">
            <div><label>الخطر</label><select id="risk-mitigation-risk-id"><option value="">اختر الخطر</option>${risks.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>المالك</label><select id="risk-mitigation-owner-id"><option value="">اختياري</option>${employees.map((row) => `<option value="${row.id}">${escapeHtml(row.fullName || row.code || String(row.id))}</option>`).join('')}</select></div>
            <div><label>تاريخ الاستحقاق</label><input id="risk-mitigation-due-date" type="date" value="${toDateInput(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))}" /></div>
            <div style="grid-column:1 / -1;"><label>عنوان الخطة</label><input id="risk-mitigation-title" /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="risk-mitigation-description" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إضافة خطة التخفيف</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>متابعة خطر</h3></div>
          <form id="risk-followup-form" class="grid-3">
            <div><label>الخطر</label><select id="risk-followup-risk-id"><option value="">اختر الخطر</option>${risks.map((row) => `<option value="${row.id}">${escapeHtml(row.code)} - ${escapeHtml(row.title || '')}</option>`).join('')}</select></div>
            <div><label>تاريخ المتابعة</label><input id="risk-followup-date" type="date" value="${toDateInput(new Date())}" /></div>
            <div><label>المراجعة التالية</label><input id="risk-followup-next-review" type="date" value="${toDateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}" /></div>
            <div><label>الحالة</label><select id="risk-followup-status"><option value="OPEN">OPEN</option><option value="WATCH">WATCH</option><option value="CLOSED">CLOSED</option></select></div>
            <div style="grid-column:1 / -1;"><label>الملاحظة</label><textarea id="risk-followup-note" rows="2"></textarea></div>
            <div style="grid-column:1 / -1;"><label>الإجراء التالي</label><textarea id="risk-followup-next-action" rows="2"></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إضافة متابعة</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>خطط التخفيف</h3></div>
          ${table(
            ['الخطر', 'الخطة', 'المالك', 'الاستحقاق', 'الحالة'],
            mitigations.map((row) => [
              escapeHtml(row.risk?.title || row.risk?.code || '-'),
              escapeHtml(row.title || '-'),
              escapeHtml(row.ownerEmployee?.fullName || '-'),
              formatDate(row.dueDate),
              statusBadge(row.status)
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>المتابعات</h3></div>
          ${table(
            ['الخطر', 'التاريخ', 'الحالة', 'الإجراء التالي', 'المراجعة التالية'],
            followups.map((row) => [
              escapeHtml(row.risk?.title || row.risk?.code || '-'),
              formatDate(row.followupDate),
              statusBadge(row.status),
              escapeHtml(row.nextAction || '-'),
              formatDate(row.nextReviewDate)
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

    document.getElementById('risk-register-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        projectId: Number(document.getElementById('risk-project-id').value || 0) || undefined,
        ownerEmployeeId: Number(document.getElementById('risk-owner-id').value || 0) || undefined,
        category: document.getElementById('risk-category').value,
        contractId: Number(document.getElementById('risk-contract-id').value || 0) || undefined,
        departmentId: Number(document.getElementById('risk-department-id').value || 0) || undefined,
        dueDate: document.getElementById('risk-due-date').value || undefined,
        probability: document.getElementById('risk-probability').value || undefined,
        impact: document.getElementById('risk-impact').value || undefined,
        title: document.getElementById('risk-title').value.trim(),
        description: document.getElementById('risk-description').value.trim() || undefined
      };
      if (!payload.title) {
        toast('أدخل عنوان الخطر قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/risk/register', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الخطر');
      await load();
    });

    document.getElementById('risk-assessment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        riskId: Number(document.getElementById('risk-assessment-risk-id').value || 0) || undefined,
        assessmentDate: document.getElementById('risk-assessment-date').value || undefined,
        probability: document.getElementById('risk-assessment-probability').value || undefined,
        impact: document.getElementById('risk-assessment-impact').value || undefined,
        notes: document.getElementById('risk-assessment-notes').value.trim() || undefined
      };
      if (!payload.riskId) {
        toast('اختر خطرًا قبل تسجيل التقييم', 'warning');
        return;
      }
      await withToast(() => request('/risk/assessments', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ التقييم');
      await load();
    });

    document.getElementById('risk-mitigation-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        riskId: Number(document.getElementById('risk-mitigation-risk-id').value || 0) || undefined,
        ownerEmployeeId: Number(document.getElementById('risk-mitigation-owner-id').value || 0) || undefined,
        dueDate: document.getElementById('risk-mitigation-due-date').value || undefined,
        title: document.getElementById('risk-mitigation-title').value.trim(),
        description: document.getElementById('risk-mitigation-description').value.trim() || undefined
      };
      if (!payload.riskId || !payload.title) {
        toast('أدخل الخطر وعنوان خطة التخفيف', 'warning');
        return;
      }
      await withToast(() => request('/risk/mitigations', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ خطة التخفيف');
      await load();
    });

    document.getElementById('risk-followup-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        riskId: Number(document.getElementById('risk-followup-risk-id').value || 0) || undefined,
        followupDate: document.getElementById('risk-followup-date').value || undefined,
        nextReviewDate: document.getElementById('risk-followup-next-review').value || undefined,
        status: document.getElementById('risk-followup-status').value,
        note: document.getElementById('risk-followup-note').value.trim() || undefined,
        nextAction: document.getElementById('risk-followup-next-action').value.trim() || undefined
      };
      if (!payload.riskId) {
        toast('اختر الخطر قبل إضافة المتابعة', 'warning');
        return;
      }
      await withToast(() => request('/risk/followup', { method: 'POST', body: JSON.stringify(payload) }), 'تمت إضافة المتابعة');
      await load();
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'register' ? 'heatmap' : mode === 'heatmap' ? 'followup' : 'register';
        location.hash = `#${routeForMode(nextMode)}`;
      },
      onSave: () => document.querySelector('form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
