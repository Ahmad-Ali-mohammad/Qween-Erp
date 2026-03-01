import { request, toQuery } from '../core/api.js';
import { setTitle, table, formatDate, setPageActions } from '../core/ui.js';

export async function renderAuditLogs() {
  setTitle('سجل التدقيق');
  const view = document.getElementById('view');
  const state = { page: 1, limit: 50, tableName: '' };

  const load = async () => {
    const result = await request(`/audit-logs${toQuery({ page: state.page, limit: state.limit, table: state.tableName || undefined })}`);
    const rows = result.data || [];
    const meta = result.meta || {};

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>فلترة السجل</h3>
          <div class="actions">
            <input id="audit-table" placeholder="اسم الجدول" value="${state.tableName}" />
            <button id="audit-filter" class="btn btn-info btn-sm">تطبيق</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>سجل العمليات</h3>
        ${table(
          ['التاريخ', 'المستخدم', 'الجدول', 'العملية', 'المعرف', 'IP'],
          rows.map((r) => [
            formatDate(r.createdAt),
            r.user?.username || '-',
            r.table,
            r.action,
            r.recordId || '-',
            r.ipAddress || '-'
          ])
        )}
        <div class="toolbar" style="margin-top:10px;">
          <span class="muted">صفحة ${meta.page || 1} من ${meta.pages || 1} (إجمالي ${meta.total || rows.length})</span>
          <div class="actions">
            <button id="audit-prev" class="btn btn-secondary btn-sm" ${state.page <= 1 ? 'disabled' : ''}>السابق</button>
            <button id="audit-next" class="btn btn-secondary btn-sm" ${(meta.page || 1) >= (meta.pages || 1) ? 'disabled' : ''}>التالي</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('audit-filter').addEventListener('click', async () => {
      state.tableName = document.getElementById('audit-table').value.trim();
      state.page = 1;
      await load();
    });

    document.getElementById('audit-prev').addEventListener('click', async () => {
      if (state.page <= 1) return;
      state.page -= 1;
      await load();
    });

    document.getElementById('audit-next').addEventListener('click', async () => {
      state.page += 1;
      await load();
    });

    setPageActions({
      onSearch: () => document.getElementById('audit-table').focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
