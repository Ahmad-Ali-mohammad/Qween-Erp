import { t } from '../i18n/ar.js';
import { setPageActions, setTitle, table } from '../core/ui.js';

function renderFlow(steps = []) {
  if (!steps.length) return `<p class="muted">${t('shells.noData', 'لا توجد بيانات حالياً')}</p>`;
  return `
    <ol>
      ${steps.map((step) => `<li>${step}</li>`).join('')}
    </ol>
  `;
}

export async function renderModuleShell(config = {}) {
  const {
    title = 'وحدة جديدة',
    subtitle = t('shells.moduleInProgress', 'هذه الوحدة قيد التنفيذ وسيتم تفعيلها تدريجياً حسب الخطة.'),
    columns = ['الحقل', 'القيمة'],
    sampleRows = [],
    flow = []
  } = config;

  setTitle(title);
  setPageActions({});

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <p class="muted">${subtitle}</p>
    </div>

    <div class="card">
      <h3>${t('shells.listTitle', 'قائمة السجلات')}</h3>
      ${table(columns, sampleRows.length ? sampleRows : [[t('shells.noData', 'لا توجد بيانات حالياً'), '-', '-']])}
    </div>

    <div class="card">
      <h3>${t('shells.formTitle', 'نموذج الإدخال')}</h3>
      <form class="grid cols-2">
        <div><label>الاسم</label><input disabled value="قيد التطوير" /></div>
        <div><label>التاريخ</label><input disabled value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea disabled>سيتم تفعيل النموذج التفصيلي في المرحلة القادمة.</textarea></div>
      </form>
    </div>

    <div class="card">
      <h3>${t('shells.detailsTitle', 'التفاصيل')}</h3>
      <p class="muted">سيتم عرض تفاصيل السجل، سجل التدقيق، والعمليات المرتبطة هنا.</p>
    </div>

    <div class="card">
      <h3>${t('shells.plannedFlows', 'التدفقات المخططة')}</h3>
      ${renderFlow(flow)}
    </div>
  `;
}
