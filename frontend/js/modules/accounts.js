import { request, withToast, toQuery } from '../core/api.js';
import {
  setTitle,
  table,
  formatMoney,
  statusBadge,
  confirmAction,
  toast,
  setPageActions
} from '../core/ui.js';

const typeOptions = [
  ['ASSET', 'أصل'],
  ['LIABILITY', 'خصوم'],
  ['EQUITY', 'حقوق ملكية'],
  ['REVENUE', 'إيراد'],
  ['EXPENSE', 'مصروف']
];

function flatten(nodes, output = []) {
  for (const n of nodes) {
    output.push(n);
    if (n.children?.length) flatten(n.children, output);
  }
  return output;
}

function renderTree(nodes) {
  const draw = (node) => {
    const hasChildren = node.children && node.children.length > 0;
    return `
      <div class="tree-node" data-id="${node.id}">
        <div class="tree-label">
          <span class="mono">${node.code}</span>
          <strong>${node.nameAr}</strong>
          ${statusBadge(node.isActive ? 'ACTIVE' : 'CLOSED')}
          <span class="muted">${node.allowPosting ? 'قابل للترحيل' : 'تجميعي'}</span>
          <span class="muted">الرصيد: ${formatMoney(node.aggregate?.closingBalance ?? 0)}</span>
        </div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${node.id}">تعديل</button>
          <button class="btn btn-warning btn-sm" data-action="move" data-id="${node.id}">نقل</button>
          <button class="btn btn-info btn-sm" data-action="toggle-posting" data-id="${node.id}" data-posting="${node.allowPosting}">${node.allowPosting ? 'إلغاء الترحيل' : 'تفعيل الترحيل'}</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${node.id}">حذف</button>
        </div>
      </div>
      ${hasChildren ? `<div class="tree-children">${node.children.map(draw).join('')}</div>` : ''}
    `;
  };

  return nodes.map(draw).join('');
}

export async function renderAccounts() {
  setTitle('دليل الحسابات');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل دليل الحسابات...</div>';

  const state = {
    search: '',
    editingId: null
  };

  const load = async () => {
    const [treeResult, listResult] = await Promise.all([
      request('/accounts/tree/with-balances'),
      request(`/accounts${toQuery({ page: 1, limit: 200, search: state.search })}`)
    ]);

    const tree = treeResult.data || [];
    const list = listResult.data || [];
    const flatTree = flatten(tree, []);

    view.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3>إدارة الحسابات</h3>
          <div class="actions">
            <button id="acc-rebuild" class="btn btn-secondary">إعادة بناء المستويات</button>
            <button id="acc-new" class="btn btn-primary">حساب جديد</button>
          </div>
        </div>
        <div class="search-row" style="margin-top:10px;">
          <input id="acc-search" placeholder="بحث بالكود أو اسم الحساب" value="${state.search}" />
          <button id="acc-search-btn" class="btn btn-info">بحث</button>
          <button id="acc-clear-btn" class="btn btn-secondary">مسح</button>
          <span class="muted" style="align-self:center;">${list.length} حساب</span>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="section-title"><h3>الهيكل الشجري</h3><span class="muted">عرض هرمي للحسابات</span></div>
          ${tree.length ? renderTree(tree) : '<p class="muted">لا توجد حسابات حالياً.</p>'}
        </div>

        <div class="card">
          <h3>${state.editingId ? 'تعديل حساب' : 'إضافة حساب'}</h3>
          <form id="acc-form" class="grid-2">
            <input id="acc-id" type="hidden" value="${state.editingId || ''}" />
            <div><label>الكود</label><input id="acc-code" required /></div>
            <div><label>الاسم العربي</label><input id="acc-nameAr" required /></div>
            <div><label>الاسم الإنجليزي</label><input id="acc-nameEn" /></div>
            <div><label>النوع</label>
              <select id="acc-type">${typeOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
            </div>
            <div><label>الحساب الأب</label>
              <select id="acc-parentId">
                <option value="">بدون (حساب رئيسي)</option>
                ${flatTree.map((acc) => `<option value="${acc.id}">${'— '.repeat(Math.max(0, acc.level - 1))}${acc.code} - ${acc.nameAr}</option>`).join('')}
              </select>
            </div>
            <div><label>طبيعة الرصيد</label>
              <select id="acc-normalBalance">
                <option value="Debit">مدين</option>
                <option value="Credit">دائن</option>
              </select>
            </div>
            <div><label><input id="acc-isControl" type="checkbox" /> حساب تجميعي</label></div>
            <div><label><input id="acc-allowPosting" type="checkbox" checked /> يسمح بالترحيل</label></div>
            <div class="actions" style="grid-column: 1 / -1;">
              <button class="btn btn-primary" type="submit">حفظ</button>
              <button class="btn btn-secondary" type="button" id="acc-reset">إعادة تعيين</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <h3>قائمة الحسابات</h3>
        ${table(
          ['الكود', 'اسم الحساب', 'النوع', 'المستوى', 'الرصيد', 'الحالة'],
          list.map((acc) => [
            acc.code,
            acc.nameAr,
            acc.type,
            acc.level,
            formatMoney(acc.aggregate?.closingBalance ?? acc.closingBalance ?? 0),
            acc.isActive ? 'نشط' : 'مغلق'
          ])
        )}
      </div>
    `;

    const searchInput = document.getElementById('acc-search');
    const codeInput = document.getElementById('acc-code');

    const runSearch = async () => {
      state.search = searchInput.value.trim();
      await load();
    };

    document.getElementById('acc-search-btn').addEventListener('click', runSearch);
    document.getElementById('acc-clear-btn').addEventListener('click', async () => {
      state.search = '';
      await load();
    });

    document.getElementById('acc-new').addEventListener('click', () => {
      state.editingId = null;
      document.getElementById('acc-form').reset();
      codeInput.focus();
    });

    document.getElementById('acc-reset').addEventListener('click', () => {
      state.editingId = null;
      document.getElementById('acc-form').reset();
    });

    document.getElementById('acc-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = Number(document.getElementById('acc-id').value || 0);

      const payload = {
        code: document.getElementById('acc-code').value.trim(),
        nameAr: document.getElementById('acc-nameAr').value.trim(),
        nameEn: document.getElementById('acc-nameEn').value.trim() || undefined,
        type: document.getElementById('acc-type').value,
        parentId: document.getElementById('acc-parentId').value ? Number(document.getElementById('acc-parentId').value) : undefined,
        normalBalance: document.getElementById('acc-normalBalance').value,
        isControl: document.getElementById('acc-isControl').checked,
        allowPosting: document.getElementById('acc-allowPosting').checked
      };

      if (id) {
        await withToast(() => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث الحساب');
      } else {
        await withToast(() => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الحساب');
      }

      state.editingId = null;
      await load();
    });

    document.getElementById('acc-rebuild').addEventListener('click', async () => {
      await withToast(() => request('/accounts/rebuild-levels', { method: 'POST' }), 'تمت إعادة بناء مستويات الشجرة');
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const row = list.find((acc) => acc.id === id);
        if (!row) return;

        state.editingId = id;
        document.getElementById('acc-id').value = row.id;
        document.getElementById('acc-code').value = row.code || '';
        document.getElementById('acc-nameAr').value = row.nameAr || '';
        document.getElementById('acc-nameEn').value = row.nameEn || '';
        document.getElementById('acc-type').value = row.type || 'ASSET';
        document.getElementById('acc-parentId').value = row.parentId || '';
        document.getElementById('acc-normalBalance').value = row.normalBalance || 'Debit';
        document.getElementById('acc-isControl').checked = Boolean(row.isControl);
        document.getElementById('acc-allowPosting').checked = Boolean(row.allowPosting);
        document.getElementById('acc-code').focus();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف الحساب إذا لم يكن مرتبطاً بحركات محاسبية. هل تريد المتابعة؟', 'تأكيد الحذف');
        if (!confirmed) return;

        await withToast(() => request(`/accounts/${id}`, { method: 'DELETE' }), 'تم حذف الحساب');
        await load();
      });
    });

    view.querySelectorAll('[data-action="move"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const nextParent = window.prompt('أدخل رقم الحساب الأب الجديد (فارغ = بدون أب):', '');
        if (nextParent === null) return;
        const parsed = nextParent.trim() ? Number(nextParent.trim()) : null;
        if (parsed !== null && Number.isNaN(parsed)) {
          toast('قيمة الحساب الأب غير صحيحة', 'warning');
          return;
        }
        await withToast(
          () => request(`/accounts/${id}/move`, { method: 'POST', body: JSON.stringify({ newParentId: parsed }) }),
          'تم نقل الحساب'
        );
        await load();
      });
    });

    view.querySelectorAll('[data-action="toggle-posting"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const current = btn.getAttribute('data-posting') === 'true';
        await withToast(
          () => request(`/accounts/${id}/toggle-posting`, { method: 'POST', body: JSON.stringify({ allowPosting: !current }) }),
          'تم تحديث حالة الترحيل'
        );
        await load();
      });
    });

    setPageActions({
      onNew: () => {
        document.getElementById('acc-form').reset();
        document.getElementById('acc-id').value = '';
        codeInput.focus();
      },
      onSave: () => document.getElementById('acc-form').requestSubmit(),
      onSearch: () => searchInput.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}
