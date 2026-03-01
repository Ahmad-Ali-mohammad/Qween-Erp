import { request, withToast, toQuery } from '../core/api.js';
import {
  setTitle,
  table,
  formatMoney,
  formatDate,
  statusBadge,
  confirmAction,
  toast,
  setPageActions
} from '../core/ui.js';

function lineRowHtml(index, accounts, line = {}) {
  return `
    <tr data-line-index="${index}">
      <td>
        <select class="j-account" required>
          <option value="">اختر الحساب</option>
          ${accounts.map((a) => `<option value="${a.id}" ${String(line.accountId) === String(a.id) ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`).join('')}
        </select>
      </td>
      <td><input class="j-desc" value="${line.description || ''}" placeholder="بيان السطر" /></td>
      <td><input class="j-debit" type="number" min="0" step="0.01" value="${line.debit || ''}" /></td>
      <td><input class="j-credit" type="number" min="0" step="0.01" value="${line.credit || ''}" /></td>
      <td><button type="button" class="btn btn-danger btn-sm" data-remove-line="${index}">حذف</button></td>
    </tr>
  `;
}

export async function renderJournals() {
  setTitle('قيود اليومية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل القيود...</div>';

  const state = {
    page: 1,
    lines: [
      { accountId: '', description: '', debit: '', credit: '' },
      { accountId: '', description: '', debit: '', credit: '' }
    ],
    editingId: null
  };

  const load = async () => {
    const [journalsRes, accountsRes, periodsRes] = await Promise.all([
      request(`/journals${toQuery({ page: state.page, limit: 50 })}`),
      request('/accounts?page=1&limit=500'),
      request('/periods')
    ]);

    const journals = journalsRes.data || [];
    const accounts = (accountsRes.data || []).filter((a) => a.allowPosting && a.isActive);
    const periods = periodsRes.data || [];

    view.innerHTML = `
      <div class="card">
        <div class="section-title">
          <h3>${state.editingId ? 'تعديل قيد' : 'قيد جديد'}</h3>
          <div class="actions">
            <button id="j-add-line" class="btn btn-secondary" type="button">إضافة سطر</button>
            <button id="j-reset" class="btn btn-warning" type="button">إعادة تعيين</button>
          </div>
        </div>

        <form id="journal-form" class="grid-3">
          <div><label>التاريخ</label><input id="j-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>الفترة</label>
            <select id="j-periodId">
              <option value="">بدون فترة</option>
              ${periods.map((p) => `<option value="${p.id}" ${p.status === 'CLOSED' ? 'disabled' : ''}>${p.fiscalYear?.name || ''} - ${p.name}</option>`).join('')}
            </select>
          </div>
          <div><label>المرجع</label><input id="j-reference" placeholder="INV-2026-0001" /></div>
          <div style="grid-column:1 / -1;"><label>البيان العام</label><input id="j-description" placeholder="وصف القيد" /></div>

          <div style="grid-column:1 / -1;">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th><th>إجراء</th></tr>
                </thead>
                <tbody id="j-lines-body">
                  ${state.lines.map((line, idx) => lineRowHtml(idx, accounts, line)).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <th colspan="2">الإجمالي</th>
                    <th id="j-total-debit">0.00</th>
                    <th id="j-total-credit">0.00</th>
                    <th id="j-balance-status" class="muted">غير متوازن</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">حفظ كمسودة</button>
            <button class="btn btn-success" id="j-save-post" type="button">حفظ وترحيل</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="section-title"><h3>قائمة القيود</h3><span class="muted">صفحة ${journalsRes.meta?.page || 1} من ${journalsRes.meta?.pages || 1}</span></div>
        ${table(
          ['رقم القيد', 'التاريخ', 'البيان', 'مدين', 'دائن', 'الحالة', 'الإجراءات'],
          journals.map((j) => [
            j.entryNumber,
            formatDate(j.date),
            j.description || '-',
            formatMoney(j.totalDebit),
            formatMoney(j.totalCredit),
            statusBadge(j.status),
            `
              <div class="actions">
                <button class="btn btn-secondary btn-sm" data-action="view" data-id="${j.id}">عرض</button>
                ${j.status === 'DRAFT' ? `<button class="btn btn-warning btn-sm" data-action="edit" data-id="${j.id}">تعديل</button>` : ''}
                ${j.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="post" data-id="${j.id}">ترحيل</button>` : ''}
                ${j.status === 'POSTED' ? `<button class="btn btn-info btn-sm" data-action="reverse" data-id="${j.id}">عكس</button>` : ''}
                ${j.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${j.id}">حذف</button>` : ''}
              </div>
            `
          ])
        )}
      </div>
    `;

    const linesBody = document.getElementById('j-lines-body');
    const form = document.getElementById('journal-form');

    const syncLinesFromDom = () => {
      const rows = Array.from(linesBody.querySelectorAll('tr'));
      state.lines = rows.map((row) => ({
        accountId: row.querySelector('.j-account').value,
        description: row.querySelector('.j-desc').value,
        debit: row.querySelector('.j-debit').value,
        credit: row.querySelector('.j-credit').value
      }));
    };

    const updateTotals = () => {
      syncLinesFromDom();
      const totals = state.lines.reduce((acc, line) => {
        acc.debit += Number(line.debit || 0);
        acc.credit += Number(line.credit || 0);
        return acc;
      }, { debit: 0, credit: 0 });

      document.getElementById('j-total-debit').textContent = formatNumberOrRaw(totals.debit);
      document.getElementById('j-total-credit').textContent = formatNumberOrRaw(totals.credit);
      const balanced = Math.abs(totals.debit - totals.credit) < 0.0001;
      document.getElementById('j-balance-status').innerHTML = balanced ? statusBadge('POSTED') : statusBadge('DRAFT');
      return balanced;
    };

    const rerenderLines = () => {
      linesBody.innerHTML = state.lines.map((line, idx) => lineRowHtml(idx, accounts, line)).join('');
      bindLineEvents();
      updateTotals();
    };

    const bindLineEvents = () => {
      linesBody.querySelectorAll('input,select').forEach((el) => {
        el.addEventListener('input', updateTotals);
        el.addEventListener('change', updateTotals);
      });

      linesBody.querySelectorAll('[data-remove-line]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-remove-line'));
          state.lines.splice(idx, 1);
          if (state.lines.length < 2) state.lines.push({ accountId: '', description: '', debit: '', credit: '' });
          rerenderLines();
        });
      });
    };

    bindLineEvents();
    updateTotals();

    document.getElementById('j-add-line').addEventListener('click', () => {
      syncLinesFromDom();
      state.lines.push({ accountId: '', description: '', debit: '', credit: '' });
      rerenderLines();
    });

    document.getElementById('j-reset').addEventListener('click', async () => {
      state.lines = [
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' }
      ];
      state.editingId = null;
      await load();
    });

    const saveDraft = async (postAfterSave = false) => {
      syncLinesFromDom();
      const payload = {
        date: document.getElementById('j-date').value,
        description: document.getElementById('j-description').value || undefined,
        reference: document.getElementById('j-reference').value || undefined,
        periodId: document.getElementById('j-periodId').value ? Number(document.getElementById('j-periodId').value) : undefined,
        lines: state.lines.map((line) => ({
          accountId: Number(line.accountId),
          description: line.description || undefined,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0)
        }))
      };

      const isBalanced = Math.abs(payload.lines.reduce((s, l) => s + l.debit, 0) - payload.lines.reduce((s, l) => s + l.credit, 0)) < 0.0001;
      if (!isBalanced) {
        toast('القيد غير متوازن. يجب أن يتساوى المدين مع الدائن.', 'warning');
        return;
      }

      if (state.editingId) {
        await withToast(() => request(`/journals/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث القيد');
      } else {
        const created = await withToast(() => request('/journals', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ القيد');
        if (postAfterSave) {
          await withToast(() => request(`/journals/${created.data.id}/post`, { method: 'POST' }), 'تم ترحيل القيد');
        }
      }

      state.editingId = null;
      state.lines = [
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' }
      ];
      await load();
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveDraft(false);
    });

    document.getElementById('j-save-post').addEventListener('click', async () => {
      await saveDraft(true);
    });

    view.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const details = await request(`/journals/${id}`);
        const linesHtml = (details.data.lines || [])
          .map((line) => `${line.account?.code || line.accountId} - ${line.account?.nameAr || ''}: ${formatMoney(line.debit)} / ${formatMoney(line.credit)}`)
          .join('\n');
        toast(`تفاصيل القيد ${details.data.entryNumber}\n${linesHtml}`, 'info');
      });
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const details = await request(`/journals/${id}`);
        const row = details.data;

        state.editingId = id;
        document.getElementById('j-date').value = row.date.slice(0, 10);
        document.getElementById('j-reference').value = row.reference || '';
        document.getElementById('j-description').value = row.description || '';
        document.getElementById('j-periodId').value = row.periodId || '';
        state.lines = (row.lines || []).map((l) => ({
          accountId: l.accountId,
          description: l.description || '',
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0)
        }));
        rerenderLines();
      });
    });

    view.querySelectorAll('[data-action="post"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/journals/${id}/post`, { method: 'POST' }), 'تم ترحيل القيد');
        await load();
      });
    });

    view.querySelectorAll('[data-action="reverse"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم إنشاء قيد عكسي لهذا القيد المرحل. هل تريد المتابعة؟', 'عكس قيد');
        if (!confirmed) return;
        await withToast(() => request(`/journals/${id}/reverse`, { method: 'POST', body: JSON.stringify({}) }), 'تم عكس القيد');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف القيد المسودة نهائياً. هل تريد المتابعة؟', 'حذف قيد');
        if (!confirmed) return;
        await withToast(() => request(`/journals/${id}`, { method: 'DELETE' }), 'تم حذف القيد');
        await load();
      });
    });

    setPageActions({
      onNew: () => document.getElementById('j-reset').click(),
      onSave: () => document.getElementById('journal-form').requestSubmit(),
      onSearch: () => toast('يمكنك استخدام البحث من قائمة القيود حسب المرجع أو التاريخ.', 'info'),
      onRefresh: () => load()
    });
  };

  await load();
}

function formatNumberOrRaw(value) {
  return Number(value || 0).toFixed(2);
}
