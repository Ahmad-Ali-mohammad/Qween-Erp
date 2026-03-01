import { request, withToast } from '../core/api.js';
import { setTitle, table, formatDate, statusBadge, confirmAction, setPageActions } from '../core/ui.js';

export async function renderFiscal(mode = 'years') {
  if (mode === 'periods') return renderPeriods();
  return renderYears();
}

async function renderYears() {
  setTitle('السنوات المالية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل السنوات المالية...</div>';

  const load = async () => {
    const rows = (await request('/fiscal-years')).data || [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة سنة مالية</h3>
        <form id="fy-form" class="grid-3">
          <div><label>اسم السنة</label><input id="fy-name" value="${new Date().getFullYear()}" required /></div>
          <div><label>تاريخ البداية</label><input id="fy-start" type="date" value="${new Date().getFullYear()}-01-01" required /></div>
          <div><label>تاريخ النهاية</label><input id="fy-end" type="date" value="${new Date().getFullYear()}-12-31" required /></div>
          <div><label><input id="fy-current" type="checkbox" /> السنة الحالية</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة السنوات المالية</h3>
        ${table(
          ['السنة', 'البداية', 'النهاية', 'الحالة', 'حالية', 'الإجراءات'],
          rows.map((r) => [
            r.name,
            formatDate(r.startDate),
            formatDate(r.endDate),
            statusBadge(r.status),
            r.isCurrent ? statusBadge('ACTIVE') : '-',
            `<div class="actions">
              <button class="btn btn-success btn-sm" data-action="set-current" data-id="${r.id}">تعيين كحالية</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('fy-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        name: document.getElementById('fy-name').value,
        startDate: document.getElementById('fy-start').value,
        endDate: document.getElementById('fy-end').value,
        isCurrent: document.getElementById('fy-current').checked,
        status: 'OPEN'
      };
      await withToast(() => request('/fiscal-years', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء السنة المالية');
      await load();
    });

    view.querySelectorAll('[data-action="set-current"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/fiscal-years/${id}/set-current`, { method: 'POST' }), 'تم تعيين السنة الحالية');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف السنة المالية إذا لم تكن مرتبطة بقيود. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/fiscal-years/${id}`, { method: 'DELETE' }), 'تم حذف السنة المالية');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('fy-form').requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderPeriods() {
  setTitle('الفترات المحاسبية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الفترات...</div>';

  const load = async () => {
    const [periodsRes, yearsRes] = await Promise.all([request('/periods'), request('/fiscal-years')]);
    const rows = periodsRes.data || [];
    const years = yearsRes.data || [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة فترة محاسبية</h3>
        <form id="period-form" class="grid-3">
          <div><label>السنة المالية</label>
            <select id="p-year" required>
              <option value="">اختر السنة</option>
              ${years.map((y) => `<option value="${y.id}">${y.name}</option>`).join('')}
            </select>
          </div>
          <div><label>رقم الفترة</label><input id="p-number" type="number" min="1" max="12" value="1" /></div>
          <div><label>اسم الفترة</label><input id="p-name" value="يناير" /></div>
          <div><label>تاريخ البداية</label><input id="p-start" type="date" required /></div>
          <div><label>تاريخ النهاية</label><input id="p-end" type="date" required /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة الفترات</h3>
        ${table(
          ['السنة', 'الفترة', 'البداية', 'النهاية', 'الحالة', 'الترحيل', 'الإجراءات'],
          rows.map((r) => [
            r.fiscalYear?.name || '-',
            `${r.number} - ${r.name}`,
            formatDate(r.startDate),
            formatDate(r.endDate),
            statusBadge(r.status),
            r.canPost ? statusBadge('ACTIVE') : statusBadge('CLOSED'),
            `<div class="actions">
              ${r.status === 'OPEN' ? `<button class="btn btn-warning btn-sm" data-action="close" data-id="${r.id}">إقفال</button>` : `<button class="btn btn-success btn-sm" data-action="open" data-id="${r.id}">فتح</button>`}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('period-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        fiscalYearId: Number(document.getElementById('p-year').value),
        number: Number(document.getElementById('p-number').value),
        name: document.getElementById('p-name').value,
        startDate: document.getElementById('p-start').value,
        endDate: document.getElementById('p-end').value,
        status: 'OPEN',
        canPost: true
      };
      await withToast(() => request('/periods', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الفترة');
      await load();
    });

    view.querySelectorAll('[data-action="close"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/periods/${id}/close`, { method: 'POST' }), 'تم إقفال الفترة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="open"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/periods/${id}/open`, { method: 'POST' }), 'تم فتح الفترة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف الفترة المحاسبية. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/periods/${id}`, { method: 'DELETE' }), 'تم حذف الفترة');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('period-form').requestSubmit(), onRefresh: () => load() });
  };

  await load();
}
