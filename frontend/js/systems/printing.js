import { extractRows, request, withToast } from '../core/api.js';
import { confirmAction, formatDate, formatNumber, setPageActions, setTitle, statusBadge, table, toast } from '../core/ui.js';
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
        <button class="system-queue-item" type="button" data-nav="${item.route || '/systems/printing/jobs'}">
          <span>${item.label}</span>
          <strong>${formatNumber(item.count)}</strong>
        </button>
      `
    )
    .join('');
}

function routeForMode(mode) {
  if (mode === 'jobs') return '/systems/printing/jobs';
  if (mode === 'archive') return '/systems/printing/archive';
  return '/systems/printing/templates';
}

export async function renderPrintingWorkspace(mode = 'templates') {
  const modeTitles = {
    templates: 'المطبوعات والتصدير - القوالب',
    jobs: 'المطبوعات والتصدير - المهام',
    archive: 'المطبوعات والتصدير - الأرشيف'
  };
  setTitle(modeTitles[mode] || modeTitles.templates);

  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل نظام المطبوعات والتصدير...</div>';

  const load = async () => {
    const [summaryRes, queuesRes, alertsRes, activityRes, chartsRes, templatesRes, jobsRes, exportsRes, conversionsRes, auditRes] = await Promise.all([
      request('/printing/dashboard/summary'),
      request('/printing/dashboard/queues'),
      request('/printing/dashboard/alerts'),
      request('/printing/dashboard/activity'),
      request('/printing/dashboard/charts'),
      request('/printing/templates?page=1&limit=100'),
      request('/printing/jobs?page=1&limit=100'),
      request('/printing/exports?page=1&limit=100'),
      request('/printing/conversions?page=1&limit=100'),
      request('/printing/audit?page=1&limit=100')
    ]);

    const summary = extractRows(summaryRes);
    const queues = extractRows(queuesRes);
    const alerts = extractRows(alertsRes);
    const activity = extractRows(activityRes);
    const charts = extractRows(chartsRes);
    const templates = extractRows(templatesRes);
    const printJobs = extractRows(jobsRes);
    const exportJobs = extractRows(exportsRes);
    const conversionJobs = extractRows(conversionsRes);
    const audits = extractRows(auditRes);

    const header = `
      <section class="workflow-hero card">
        <div>
          <p class="dash-overline">Printing & Export</p>
          <h3>إدارة القوالب والمخرجات والأرشيف من مكان واحد</h3>
          <p class="muted">تدفق متكامل للطباعة والتصدير والتحويل مع سجل تدقيق مركزي ودعم كامل للتنبيهات.</p>
        </div>
        <div class="workflow-kpis">${renderHeroCards(summary)}</div>
      </section>
      <section class="workflow-grid">
        <article class="card workflow-main">
          <div class="section-title">
            <h3>قوائم التنفيذ</h3>
            <span class="muted">الطوابير والاعتمادات</span>
          </div>
          <div class="system-queue-list">${renderQueueList(queues)}</div>
        </article>
        <aside class="card workflow-side">
          <h3>تنبيهات الطباعة</h3>
          <div class="system-alert-stack">${renderAlertStack(alerts)}</div>
        </aside>
      </section>
    `;

    const baseSections = `
      <section class="card">
        <div class="section-title">
          <h3>المؤشرات الرسومية</h3>
          <span class="muted">أحجام التنفيذ والحالات والصيغ</span>
        </div>
        ${renderChartBlocks(charts)}
      </section>
      <section class="card">
        <div class="section-title"><h3>النشاط الأخير</h3></div>
        ${table(['العنصر', 'الوصف', 'التاريخ', 'الحالة'], activity.map((item) => [item.title, item.subtitle || '-', formatDate(item.date), statusBadge(item.status)]))}
      </section>
    `;

    const templateOptions = templates
      .map((row) => `<option value="${row.id}">${escapeHtml(row.key)} - ${escapeHtml(row.title || row.entityType || '')}</option>`)
      .join('');

    if (mode === 'templates') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إضافة قالب طباعة</h3></div>
          <form id="printing-template-form" class="grid-3">
            <div><label>كود القالب</label><input id="printing-template-key" placeholder="اختياري" /></div>
            <div><label>العنوان</label><input id="printing-template-title" required /></div>
            <div><label>نوع الكيان</label><input id="printing-template-entity-type" placeholder="Invoice / Contract / PO" required /></div>
            <div><label>صيغة افتراضية</label>
              <select id="printing-template-format">
                <option value="PDF">PDF</option>
                <option value="DOCX">DOCX</option>
                <option value="XLSX">XLSX</option>
                <option value="CSV">CSV</option>
              </select>
            </div>
            <div style="grid-column:1 / -1;">
              <label>HTML القالب</label>
              <textarea id="printing-template-html" rows="5" placeholder="<h1>{{number}}</h1>" required></textarea>
            </div>
            <div class="actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">حفظ القالب</button>
            </div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>دفتر القوالب</h3></div>
          ${table(
            ['الكود', 'العنوان', 'الكيان', 'الصيغة', 'الحالة', 'آخر تحديث', 'الإجراءات'],
            templates.map((row) => [
              row.key,
              row.title,
              row.entityType,
              row.defaultFormat,
              statusBadge(row.status),
              formatDate(row.updatedAt),
              `<div class="actions">
                ${
                  row.status === 'ACTIVE'
                    ? `<button class="btn btn-warning btn-sm" data-action="template-deactivate" data-id="${row.id}">تعطيل</button>`
                    : `<button class="btn btn-success btn-sm" data-action="template-activate" data-id="${row.id}">تفعيل</button>`
                }
              </div>`
            ])
          )}
        </section>
        ${baseSections}
      `;
    } else if (mode === 'jobs') {
      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>إنشاء مهمة طباعة</h3></div>
          <form id="printing-job-form" class="grid-3">
            <div><label>القالب</label><select id="printing-job-template-id"><option value="">بدون قالب</option>${templateOptions}</select></div>
            <div><label>نوع الكيان</label><input id="printing-job-entity-type" placeholder="Invoice" required /></div>
            <div><label>معرف الكيان</label><input id="printing-job-entity-id" placeholder="123" /></div>
            <div><label>الصيغة</label><select id="printing-job-format"><option value="PDF">PDF</option><option value="DOCX">DOCX</option><option value="XLSX">XLSX</option></select></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إرسال مهمة طباعة</button></div>
          </form>
          <hr />
          <div class="section-title"><h3>إنشاء مهمة تصدير</h3></div>
          <form id="printing-export-form" class="grid-3">
            <div><label>المصدر</label><input id="printing-export-source" placeholder="invoices" required /></div>
            <div><label>الصيغة</label><select id="printing-export-format"><option value="XLSX">XLSX</option><option value="CSV">CSV</option><option value="JSON">JSON</option></select></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-info" type="submit">إرسال مهمة تصدير</button></div>
          </form>
          <hr />
          <div class="section-title"><h3>إنشاء مهمة تحويل</h3></div>
          <form id="printing-conversion-form" class="grid-3">
            <div><label>اسم الملف المصدر</label><input id="printing-conversion-source-name" required /></div>
            <div><label>صيغة المصدر</label><input id="printing-conversion-source-format" placeholder="PDF" required /></div>
            <div><label>صيغة الهدف</label><input id="printing-conversion-target-format" placeholder="XLSX" required /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-secondary" type="submit">إرسال مهمة تحويل</button></div>
          </form>
        </section>
        <section class="card">
          <div class="section-title"><h3>مهام الطباعة</h3></div>
          ${table(
            ['الرقم', 'الكيان', 'الصيغة', 'الحالة', 'التاريخ', 'الإجراءات'],
            printJobs.map((row) => [
              row.number,
              row.entityType,
              row.outputFormat,
              statusBadge(row.status),
              formatDate(row.requestedAt),
              `<div class="actions">
                ${
                  row.status === 'QUEUED'
                    ? `<button class="btn btn-info btn-sm" data-action="print-running" data-id="${row.id}">تشغيل</button>`
                    : ''
                }
                ${
                  row.status === 'RUNNING' || row.status === 'QUEUED'
                    ? `<button class="btn btn-success btn-sm" data-action="print-complete" data-id="${row.id}">اكتمال</button>`
                    : ''
                }
                ${
                  row.status === 'RUNNING' || row.status === 'QUEUED'
                    ? `<button class="btn btn-warning btn-sm" data-action="print-fail" data-id="${row.id}">فشل</button>`
                    : ''
                }
              </div>`
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>مهام التصدير</h3></div>
          ${table(
            ['الرقم', 'المصدر', 'الصيغة', 'الحالة', 'الصفوف', 'التاريخ', 'الإجراءات'],
            exportJobs.map((row) => [
              row.number,
              row.sourceType,
              row.outputFormat,
              statusBadge(row.status),
              formatNumber(row.rowsExported || 0),
              formatDate(row.requestedAt),
              `<div class="actions">
                ${
                  row.status === 'QUEUED' || row.status === 'RUNNING'
                    ? `<button class="btn btn-success btn-sm" data-action="export-complete" data-id="${row.id}">اكتمال</button>`
                    : ''
                }
                ${
                  row.status === 'QUEUED' || row.status === 'RUNNING'
                    ? `<button class="btn btn-warning btn-sm" data-action="export-fail" data-id="${row.id}">فشل</button>`
                    : ''
                }
              </div>`
            ])
          )}
        </section>
        <section class="card">
          <div class="section-title"><h3>مهام التحويل</h3></div>
          ${table(
            ['الرقم', 'المصدر', 'التحويل', 'الحالة', 'التاريخ', 'الإجراءات'],
            conversionJobs.map((row) => [
              row.number,
              row.sourceFileName,
              `${row.sourceFormat} -> ${row.targetFormat}`,
              statusBadge(row.status),
              formatDate(row.requestedAt),
              `<div class="actions">
                ${
                  row.status === 'QUEUED' || row.status === 'RUNNING'
                    ? `<button class="btn btn-success btn-sm" data-action="conversion-complete" data-id="${row.id}">اكتمال</button>`
                    : ''
                }
                ${
                  row.status === 'QUEUED' || row.status === 'RUNNING'
                    ? `<button class="btn btn-warning btn-sm" data-action="conversion-fail" data-id="${row.id}">فشل</button>`
                    : ''
                }
              </div>`
            ])
          )}
        </section>
        ${baseSections}
      `;
    } else {
      const completedRows = [
        ...printJobs.filter((row) => row.status === 'COMPLETED').map((row) => ['طباعة', row.number, row.outputFormat, formatDate(row.completedAt || row.updatedAt)]),
        ...exportJobs.filter((row) => row.status === 'COMPLETED').map((row) => ['تصدير', row.number, row.outputFormat, formatDate(row.completedAt || row.updatedAt)]),
        ...conversionJobs.filter((row) => row.status === 'COMPLETED').map((row) => ['تحويل', row.number, `${row.sourceFormat} -> ${row.targetFormat}`, formatDate(row.completedAt || row.updatedAt)])
      ].slice(0, 50);

      view.innerHTML = `
        ${header}
        <section class="card">
          <div class="section-title"><h3>أرشيف المخرجات المكتملة</h3></div>
          ${table(['النوع', 'الرقم', 'التفاصيل', 'تاريخ الاكتمال'], completedRows)}
        </section>
        <section class="card">
          <div class="section-title"><h3>سجل التدقيق</h3></div>
          ${table(
            ['الإجراء', 'المورد', 'الحالة', 'التفاصيل', 'التاريخ'],
            audits.map((row) => [
              row.action,
              `${row.resourceType}#${row.resourceId}`,
              statusBadge(row.status),
              row.note || '-',
              formatDate(row.createdAt)
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

    document.getElementById('printing-template-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        key: document.getElementById('printing-template-key').value.trim() || undefined,
        title: document.getElementById('printing-template-title').value.trim(),
        entityType: document.getElementById('printing-template-entity-type').value.trim(),
        defaultFormat: document.getElementById('printing-template-format').value || 'PDF',
        templateHtml: document.getElementById('printing-template-html').value || ''
      };
      if (!payload.title || !payload.entityType || !payload.templateHtml.trim()) {
        toast('أكمل بيانات القالب قبل الحفظ', 'warning');
        return;
      }
      await withToast(() => request('/printing/templates', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء القالب');
      await load();
    });

    document.getElementById('printing-job-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        templateId: Number(document.getElementById('printing-job-template-id').value || 0) || undefined,
        entityType: document.getElementById('printing-job-entity-type').value.trim(),
        entityId: document.getElementById('printing-job-entity-id').value.trim() || undefined,
        outputFormat: document.getElementById('printing-job-format').value || 'PDF'
      };
      if (!payload.entityType) {
        toast('حدد نوع الكيان', 'warning');
        return;
      }
      await withToast(() => request('/printing/jobs', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء مهمة الطباعة');
      await load();
    });

    document.getElementById('printing-export-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        sourceType: document.getElementById('printing-export-source').value.trim(),
        outputFormat: document.getElementById('printing-export-format').value || 'XLSX'
      };
      if (!payload.sourceType) {
        toast('حدد مصدر التصدير', 'warning');
        return;
      }
      await withToast(() => request('/printing/exports', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء مهمة التصدير');
      await load();
    });

    document.getElementById('printing-conversion-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        sourceFileName: document.getElementById('printing-conversion-source-name').value.trim(),
        sourceFormat: document.getElementById('printing-conversion-source-format').value.trim(),
        targetFormat: document.getElementById('printing-conversion-target-format').value.trim()
      };
      if (!payload.sourceFileName || !payload.sourceFormat || !payload.targetFormat) {
        toast('أكمل بيانات التحويل', 'warning');
        return;
      }
      await withToast(() => request('/printing/conversions', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء مهمة التحويل');
      await load();
    });

    view.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-id'));
        const action = button.getAttribute('data-action');
        if (!id || !action) return;

        if (action === 'template-activate' || action === 'template-deactivate') {
          const active = action === 'template-activate';
          await withToast(
            () => request(`/printing/templates/${id}/activate`, { method: 'POST', body: JSON.stringify({ active }) }),
            active ? 'تم تفعيل القالب' : 'تم تعطيل القالب'
          );
          await load();
          return;
        }

        if (action === 'print-running') {
          await withToast(() => request(`/printing/jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'RUNNING' }) }), 'تم تشغيل المهمة');
          await load();
          return;
        }
        if (action === 'print-complete') {
          const fileName = window.prompt('اسم الملف الناتج:', `print-${id}.pdf`) || undefined;
          await withToast(
            () => request(`/printing/jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'COMPLETED', fileName }) }),
            'تم إغلاق المهمة كمكتملة'
          );
          await load();
          return;
        }
        if (action === 'print-fail') {
          const message = window.prompt('سبب الفشل:', 'generation failed') || 'generation failed';
          await withToast(
            () => request(`/printing/jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'FAILED', errorMessage: message }) }),
            'تم تسجيل فشل المهمة'
          );
          await load();
          return;
        }

        if (action === 'export-complete') {
          const rows = Number(window.prompt('عدد الصفوف المصدرة:', '0') || 0);
          await withToast(
            () => request(`/printing/exports/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'COMPLETED', rowsExported: rows }) }),
            'تم إغلاق التصدير كمكتمل'
          );
          await load();
          return;
        }
        if (action === 'export-fail') {
          const accepted = await confirmAction('تأكيد تسجيل مهمة التصدير كفاشلة؟');
          if (!accepted) return;
          await withToast(
            () => request(`/printing/exports/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'FAILED', errorMessage: 'export failed' }) }),
            'تم تسجيل فشل التصدير'
          );
          await load();
          return;
        }

        if (action === 'conversion-complete') {
          const outputFileName = window.prompt('اسم الملف الناتج:', `conversion-${id}.xlsx`) || undefined;
          await withToast(
            () => request(`/printing/conversions/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'COMPLETED', outputFileName }) }),
            'تم إغلاق التحويل كمكتمل'
          );
          await load();
          return;
        }
        if (action === 'conversion-fail') {
          await withToast(
            () => request(`/printing/conversions/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'FAILED', errorMessage: 'conversion failed' }) }),
            'تم تسجيل فشل التحويل'
          );
          await load();
        }
      });
    });

    setPageActions({
      onNew: () => {
        const nextMode = mode === 'templates' ? 'jobs' : mode === 'jobs' ? 'archive' : 'templates';
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
