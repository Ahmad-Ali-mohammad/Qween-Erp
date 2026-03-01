import { request, withToast, extractRows, toQuery } from '../core/api.js';
import { setTitle, table, formatDate, formatMoney, statusBadge, setPageActions, confirmAction } from '../core/ui.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentYear() {
  return new Date().getFullYear();
}

function toIsoDateTime(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function renderOperations(mode) {
  if (mode === 'opportunities') return renderOpportunities();
  if (mode === 'contacts') return renderContacts();
  if (mode === 'projects') return renderProjects();
  if (mode === 'project-tasks') return renderProjectTasks();
  if (mode === 'project-expenses') return renderProjectExpenses();
  if (mode === 'employees') return renderEmployees();
  if (mode === 'leave-requests') return renderLeaveRequests();
  if (mode === 'payroll-runs') return renderPayrollRuns();
  if (mode === 'contracts') return renderContracts();
  if (mode === 'contract-milestones') return renderContractMilestones();
}

async function renderOpportunities() {
  setTitle('فرص البيع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل فرص البيع...</div>';

  const load = async () => {
    const [rowsRes, customersRes] = await Promise.all([request('/opportunities'), request('/customers')]);
    const rows = asArray(extractRows(rowsRes));
    const customers = asArray(extractRows(customersRes));

    view.innerHTML = `
      <div class="card">
        <h3>إضافة فرصة بيع</h3>
        <form id="opp-form" class="grid-3">
          <div><label>العنوان</label><input id="opp-title" required /></div>
          <div><label>العميل</label>
            <select id="opp-customer">
              <option value="">بدون عميل</option>
              ${customers.map((c) => `<option value="${c.id}">${c.code} - ${c.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>المرحلة</label>
            <select id="opp-stage">
              <option>LEAD</option>
              <option>QUALIFIED</option>
              <option>PROPOSAL</option>
              <option>NEGOTIATION</option>
              <option>WON</option>
              <option>LOST</option>
            </select>
          </div>
          <div><label>الاحتمالية %</label><input id="opp-prob" type="number" min="0" max="100" value="0" /></div>
          <div><label>القيمة المتوقعة</label><input id="opp-value" type="number" step="0.01" value="0" /></div>
          <div><label>تاريخ الإغلاق المتوقع</label><input id="opp-close" type="date" /></div>
          <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="opp-notes" rows="2"></textarea></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ الفرصة</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة الفرص</h3>
        ${table(
          ['العنوان', 'العميل', 'المرحلة', 'الاحتمالية', 'القيمة', 'الحالة', 'الإجراءات'],
          rows.map((r) => [
            r.title || '-',
            r.customerId || '-',
            `
            <select data-stage-select="${r.id}">
              ${['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']
                .map((s) => `<option value="${s}" ${s === r.stage ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
            `,
            `${Number(r.probability || 0)}%`,
            formatMoney(r.value || 0),
            r.status ? statusBadge(r.status) : '-',
            `<div class="actions">
              <button class="btn btn-info btn-sm" data-action="stage" data-id="${r.id}">تحديث المرحلة</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('opp-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        title: document.getElementById('opp-title').value.trim(),
        customerId: document.getElementById('opp-customer').value ? Number(document.getElementById('opp-customer').value) : undefined,
        stage: document.getElementById('opp-stage').value,
        probability: Number(document.getElementById('opp-prob').value || 0),
        value: Number(document.getElementById('opp-value').value || 0),
        expectedCloseDate: toIsoDateTime(document.getElementById('opp-close').value),
        status: 'OPEN',
        notes: document.getElementById('opp-notes').value.trim() || undefined
      };
      await withToast(() => request('/opportunities', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ فرصة البيع');
      await load();
    });

    view.querySelectorAll('[data-action="stage"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const stage = view.querySelector(`[data-stage-select="${id}"]`)?.value;
        await withToast(() => request(`/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }), 'تم تحديث المرحلة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف فرصة البيع؟');
        if (!confirmed) return;
        await withToast(() => request(`/opportunities/${id}`, { method: 'DELETE' }), 'تم حذف الفرصة');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('opp-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderContacts() {
  setTitle('جهات الاتصال');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل جهات الاتصال...</div>';
  const state = { editingId: null, partyType: 'CUSTOMER' };

  const load = async () => {
    const [contactsRes, customersRes, suppliersRes] = await Promise.all([request('/contacts'), request('/customers'), request('/suppliers')]);
    const contacts = asArray(extractRows(contactsRes));
    const customers = asArray(extractRows(customersRes));
    const suppliers = asArray(extractRows(suppliersRes));
    const parties = state.partyType === 'CUSTOMER' ? customers : suppliers;
    const editing = state.editingId ? contacts.find((c) => c.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل جهة اتصال' : 'إضافة جهة اتصال'}</h3>
        <form id="contact-form" class="grid-3">
          <div><label>نوع الكيان</label>
            <select id="ct-type">
              <option value="CUSTOMER" ${state.partyType === 'CUSTOMER' ? 'selected' : ''}>عميل</option>
              <option value="SUPPLIER" ${state.partyType === 'SUPPLIER' ? 'selected' : ''}>مورد</option>
            </select>
          </div>
          <div><label>الكيان</label>
            <select id="ct-party" required>
              <option value="">اختر</option>
              ${parties.map((p) => `<option value="${p.id}" ${editing && ((state.partyType === 'CUSTOMER' && editing.customerId === p.id) || (state.partyType === 'SUPPLIER' && editing.supplierId === p.id)) ? 'selected' : ''}>${p.code} - ${p.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>الاسم</label><input id="ct-name" required value="${editing?.name || ''}" /></div>
          <div><label>المنصب</label><input id="ct-position" value="${editing?.position || ''}" /></div>
          <div><label>الهاتف</label><input id="ct-phone" value="${editing?.phone || ''}" /></div>
          <div><label>الجوال</label><input id="ct-mobile" value="${editing?.mobile || ''}" /></div>
          <div><label>البريد الإلكتروني</label><input id="ct-email" type="email" value="${editing?.email || ''}" /></div>
          <div><label>جهة رئيسية</label>
            <select id="ct-primary">
              <option value="false" ${editing?.isPrimary ? '' : 'selected'}>لا</option>
              <option value="true" ${editing?.isPrimary ? 'selected' : ''}>نعم</option>
            </select>
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="ct-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة جهات الاتصال</h3>
        ${table(
          ['الاسم', 'النوع', 'الكيان', 'الهاتف', 'البريد', 'رئيسي', 'الإجراءات'],
          contacts.map((c) => [
            c.name || '-',
            c.customerId ? 'عميل' : 'مورد',
            c.customer?.nameAr || c.supplier?.nameAr || c.customerId || c.supplierId || '-',
            c.phone || c.mobile || '-',
            c.email || '-',
            c.isPrimary ? statusBadge('ACTIVE') : '-',
            `<div class="actions">
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${c.id}">تعديل</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('ct-type')?.addEventListener('change', async (event) => {
      state.partyType = event.target.value;
      state.editingId = null;
      await load();
    });

    document.getElementById('ct-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('contact-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const partyId = Number(document.getElementById('ct-party').value);
      const payload = {
        name: document.getElementById('ct-name').value.trim(),
        position: document.getElementById('ct-position').value.trim() || undefined,
        phone: document.getElementById('ct-phone').value.trim() || undefined,
        mobile: document.getElementById('ct-mobile').value.trim() || undefined,
        email: document.getElementById('ct-email').value.trim() || undefined,
        isPrimary: document.getElementById('ct-primary').value === 'true',
        customerId: state.partyType === 'CUSTOMER' ? partyId : undefined,
        supplierId: state.partyType === 'SUPPLIER' ? partyId : undefined
      };

      if (state.editingId) {
        await withToast(() => request(`/contacts/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث جهة الاتصال');
      } else {
        await withToast(() => request('/contacts', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء جهة الاتصال');
      }
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const row = contacts.find((c) => c.id === id);
        if (!row) return;
        state.editingId = id;
        state.partyType = row.customerId ? 'CUSTOMER' : 'SUPPLIER';
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف جهة الاتصال؟');
        if (!confirmed) return;
        await withToast(() => request(`/contacts/${id}`, { method: 'DELETE' }), 'تم حذف جهة الاتصال');
        state.editingId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('contact-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderProjects() {
  setTitle('المشاريع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل المشاريع...</div>';
  const state = { editingId: null, selectedId: null };

  const load = async () => {
    const rows = asArray(extractRows(await request('/projects')));
    const selected = state.selectedId ? rows.find((r) => r.id === state.selectedId) : null;
    const [tasksRes, expensesRes] = state.selectedId
      ? await Promise.all([request(`/projects/${state.selectedId}/tasks?limit=5`), request(`/projects/${state.selectedId}/expenses?limit=5`)])
      : [{ data: [] }, { data: [] }];
    const tasks = asArray(extractRows(tasksRes));
    const expenses = asArray(extractRows(expensesRes));
    const editing = state.editingId ? rows.find((r) => r.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل مشروع' : 'إضافة مشروع'}</h3>
        <form id="project-form" class="grid-3">
          <div><label>الرمز</label><input id="pr-code" required value="${editing?.code || ''}" /></div>
          <div><label>الاسم العربي</label><input id="pr-nameAr" required value="${editing?.nameAr || ''}" /></div>
          <div><label>الاسم الإنجليزي</label><input id="pr-nameEn" value="${editing?.nameEn || ''}" /></div>
          <div><label>الحالة</label><input id="pr-status" value="${editing?.status || 'Active'}" /></div>
          <div><label>تاريخ البداية</label><input id="pr-start" type="date" value="${editing?.startDate ? String(editing.startDate).slice(0, 10) : ''}" /></div>
          <div><label>تاريخ النهاية</label><input id="pr-end" type="date" value="${editing?.endDate ? String(editing.endDate).slice(0, 10) : ''}" /></div>
          <div><label>الميزانية</label><input id="pr-budget" type="number" step="0.01" value="${editing?.budget || 0}" /></div>
          <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="pr-desc" rows="2">${editing?.description || ''}</textarea></div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="pr-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة المشاريع</h3>
        ${table(
          ['الرمز', 'الاسم', 'الحالة', 'الميزانية', 'التكلفة الفعلية', 'الإجراءات'],
          rows.map((r) => [
            r.code || '-',
            r.nameAr || '-',
            r.status || '-',
            formatMoney(r.budget || 0),
            formatMoney(r.actualCost || 0),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="select" data-id="${r.id}">عرض</button>
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${r.id}">تعديل</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>

      <div class="card">
        <h3>تفاصيل المشروع ${selected ? `- ${selected.nameAr}` : ''}</h3>
        ${
          selected
            ? `
          <div class="grid-3">
            <div><label>الرمز</label><div>${selected.code}</div></div>
            <div><label>الحالة</label><div>${selected.status || '-'}</div></div>
            <div><label>الميزانية</label><div>${formatMoney(selected.budget || 0)}</div></div>
          </div>
          <h4 style="margin-top:12px;">آخر المهام</h4>
          ${table(['العنوان', 'الحالة', 'الأولوية'], tasks.map((t) => [t.title || '-', t.status || '-', t.priority || '-']))}
          <h4 style="margin-top:12px;">آخر المصاريف</h4>
          ${table(['التاريخ', 'الفئة', 'الوصف', 'المبلغ'], expenses.map((e) => [formatDate(e.date), e.category || '-', e.description || '-', formatMoney(e.amount || 0)]))}
        `
            : '<p class="muted">اختر مشروعاً لعرض التفاصيل.</p>'
        }
      </div>
    `;

    document.getElementById('pr-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('project-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('pr-code').value.trim(),
        nameAr: document.getElementById('pr-nameAr').value.trim(),
        nameEn: document.getElementById('pr-nameEn').value.trim() || undefined,
        status: document.getElementById('pr-status').value.trim() || 'Active',
        startDate: toIsoDateTime(document.getElementById('pr-start').value),
        endDate: toIsoDateTime(document.getElementById('pr-end').value),
        budget: Number(document.getElementById('pr-budget').value || 0),
        actualCost: Number(editing?.actualCost || 0),
        isActive: editing?.isActive ?? true,
        description: document.getElementById('pr-desc').value.trim() || undefined
      };

      if (state.editingId) {
        await withToast(() => request(`/projects/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث المشروع');
      } else {
        await withToast(() => request('/projects', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المشروع');
      }
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="select"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.selectedId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.editingId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف المشروع؟');
        if (!confirmed) return;
        await withToast(() => request(`/projects/${id}`, { method: 'DELETE' }), 'تم حذف المشروع');
        if (state.selectedId === id) state.selectedId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('project-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderProjectTasks() {
  setTitle('مهام المشاريع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مهام المشاريع...</div>';
  const state = { projectId: '', editingId: null };

  const load = async () => {
    const projects = asArray(extractRows(await request('/projects')));
    if (!state.projectId && projects.length) state.projectId = String(projects[0].id);
    const rowsRes = state.projectId ? await request(`/projects/${state.projectId}/tasks`) : await request('/project-tasks');
    const rows = asArray(extractRows(rowsRes));
    const editing = state.editingId ? rows.find((r) => r.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل مهمة' : 'إضافة مهمة'}</h3>
        <form id="task-form" class="grid-3">
          <div><label>المشروع</label>
            <select id="tsk-project">
              ${projects.map((p) => `<option value="${p.id}" ${String(p.id) === String(state.projectId) ? 'selected' : ''}>${p.code} - ${p.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>العنوان</label><input id="tsk-title" required value="${editing?.title || ''}" /></div>
          <div><label>الأولوية</label><input id="tsk-priority" value="${editing?.priority || 'MEDIUM'}" /></div>
          <div><label>الحالة</label><input id="tsk-status" value="${editing?.status || 'TODO'}" /></div>
          <div><label>نسبة الإنجاز</label><input id="tsk-progress" type="number" min="0" max="100" value="${editing?.progress || 0}" /></div>
          <div><label>ساعات تقديرية</label><input id="tsk-hours" type="number" min="0" step="0.01" value="${editing?.estimatedHours || 0}" /></div>
          <div><label>تاريخ البداية</label><input id="tsk-start" type="date" value="${editing?.startDate ? String(editing.startDate).slice(0, 10) : ''}" /></div>
          <div><label>تاريخ النهاية</label><input id="tsk-end" type="date" value="${editing?.endDate ? String(editing.endDate).slice(0, 10) : ''}" /></div>
          <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="tsk-desc" rows="2">${editing?.description || ''}</textarea></div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="tsk-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة المهام</h3>
        ${table(
          ['العنوان', 'الحالة', 'الأولوية', 'الإنجاز', 'تاريخ البداية', 'الإجراءات'],
          rows.map((r) => [
            r.title || '-',
            r.status || '-',
            r.priority || '-',
            `${Number(r.progress || 0)}%`,
            formatDate(r.startDate),
            `<div class="actions">
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${r.id}">تعديل</button>
              <button class="btn btn-success btn-sm" data-action="done" data-id="${r.id}">إكمال</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('tsk-project')?.addEventListener('change', async (event) => {
      state.projectId = event.target.value;
      state.editingId = null;
      await load();
    });
    document.getElementById('tsk-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        title: document.getElementById('tsk-title').value.trim(),
        description: document.getElementById('tsk-desc').value.trim() || undefined,
        priority: document.getElementById('tsk-priority').value.trim() || 'MEDIUM',
        status: document.getElementById('tsk-status').value.trim() || 'TODO',
        progress: Number(document.getElementById('tsk-progress').value || 0),
        estimatedHours: Number(document.getElementById('tsk-hours').value || 0),
        startDate: document.getElementById('tsk-start').value || undefined,
        endDate: document.getElementById('tsk-end').value || undefined
      };
      const projectId = Number(document.getElementById('tsk-project').value);

      if (state.editingId) {
        await withToast(() => request(`/project-tasks/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث المهمة');
      } else {
        await withToast(() => request(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المهمة');
      }
      state.projectId = String(projectId);
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.editingId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="done"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/project-tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'DONE', progress: 100 }) }), 'تم إكمال المهمة');
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف المهمة؟');
        if (!confirmed) return;
        await withToast(() => request(`/project-tasks/${id}`, { method: 'DELETE' }), 'تم حذف المهمة');
        state.editingId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('task-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderProjectExpenses() {
  setTitle('مصاريف المشاريع');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مصاريف المشاريع...</div>';
  const state = { projectId: '' };

  const load = async () => {
    const projects = asArray(extractRows(await request('/projects')));
    if (!state.projectId && projects.length) state.projectId = String(projects[0].id);
    const rows = state.projectId ? asArray(extractRows(await request(`/projects/${state.projectId}/expenses`))) : [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة مصروف مشروع</h3>
        <form id="exp-form" class="grid-3">
          <div><label>المشروع</label>
            <select id="exp-project">
              ${projects.map((p) => `<option value="${p.id}" ${String(p.id) === String(state.projectId) ? 'selected' : ''}>${p.code} - ${p.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>التاريخ</label><input id="exp-date" type="date" value="${todayIso()}" /></div>
          <div><label>الفئة</label><input id="exp-category" /></div>
          <div><label>المبلغ</label><input id="exp-amount" type="number" step="0.01" value="0" required /></div>
          <div><label>المرجع</label><input id="exp-ref" /></div>
          <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="exp-desc" rows="2"></textarea></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ المصروف</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة المصاريف</h3>
        ${table(
          ['التاريخ', 'الفئة', 'الوصف', 'المبلغ', 'المرجع', 'الإجراءات'],
          rows.map((r) => [
            formatDate(r.date),
            r.category || '-',
            r.description || '-',
            formatMoney(r.amount || 0),
            r.reference || '-',
            `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('exp-project')?.addEventListener('change', async (event) => {
      state.projectId = event.target.value;
      await load();
    });

    document.getElementById('exp-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const projectId = Number(document.getElementById('exp-project').value);
      const payload = {
        date: toIsoDateTime(document.getElementById('exp-date').value) || toIsoDateTime(todayIso()),
        category: document.getElementById('exp-category').value.trim() || undefined,
        description: document.getElementById('exp-desc').value.trim() || undefined,
        amount: Number(document.getElementById('exp-amount').value || 0),
        reference: document.getElementById('exp-ref').value.trim() || undefined
      };
      await withToast(() => request(`/projects/${projectId}/expenses`, { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ المصروف');
      state.projectId = String(projectId);
      await load();
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف المصروف؟');
        if (!confirmed) return;
        await withToast(() => request(`/expenses/${id}`, { method: 'DELETE' }), 'تم حذف المصروف');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('exp-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderEmployees() {
  setTitle('الموظفون');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل بيانات الموظفين...</div>';
  const state = { editingId: null };

  const load = async () => {
    const rows = asArray(extractRows(await request('/employees')));
    const editing = state.editingId ? rows.find((r) => r.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل موظف' : 'إضافة موظف'}</h3>
        <form id="emp-form" class="grid-3">
          <div><label>رمز الموظف</label><input id="emp-code" required value="${editing?.code || ''}" /></div>
          <div><label>الاسم الكامل</label><input id="emp-name" required value="${editing?.fullName || ''}" /></div>
          <div><label>البريد الإلكتروني</label><input id="emp-email" type="email" value="${editing?.email || ''}" /></div>
          <div><label>الهاتف</label><input id="emp-phone" value="${editing?.phone || ''}" /></div>
          <div><label>القسم</label><input id="emp-dept" value="${editing?.department || ''}" /></div>
          <div><label>المسمى الوظيفي</label><input id="emp-position" value="${editing?.position || ''}" /></div>
          <div><label>تاريخ التعيين</label><input id="emp-hire" type="date" value="${editing?.hireDate ? String(editing.hireDate).slice(0, 10) : ''}" /></div>
          <div><label>الراتب الأساسي</label><input id="emp-basic" type="number" step="0.01" value="${editing?.baseSalary || 0}" /></div>
          <div><label>البدلات</label><input id="emp-allow" type="number" step="0.01" value="${editing?.allowances || 0}" /></div>
          <div><label>الحالة</label><input id="emp-status" value="${editing?.status || 'ACTIVE'}" /></div>
          <div><label>آيبان</label><input id="emp-iban" value="${editing?.bankAccountIban || ''}" /></div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="emp-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة الموظفين</h3>
        ${table(
          ['الرمز', 'الاسم', 'القسم', 'الحالة', 'الراتب الأساسي', 'الإجراءات'],
          rows.map((r) => [
            r.code || '-',
            r.fullName || '-',
            r.department || '-',
            r.status || '-',
            formatMoney(r.baseSalary || 0),
            `<div class="actions">
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${r.id}">تعديل</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('emp-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('emp-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('emp-code').value.trim(),
        fullName: document.getElementById('emp-name').value.trim(),
        email: document.getElementById('emp-email').value.trim() || undefined,
        phone: document.getElementById('emp-phone').value.trim() || undefined,
        department: document.getElementById('emp-dept').value.trim() || undefined,
        position: document.getElementById('emp-position').value.trim() || undefined,
        hireDate: toIsoDateTime(document.getElementById('emp-hire').value),
        baseSalary: Number(document.getElementById('emp-basic').value || 0),
        allowances: Number(document.getElementById('emp-allow').value || 0),
        status: document.getElementById('emp-status').value.trim() || 'ACTIVE',
        bankAccountIban: document.getElementById('emp-iban').value.trim() || undefined
      };

      if (state.editingId) {
        await withToast(() => request(`/employees/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث بيانات الموظف');
      } else {
        await withToast(() => request('/employees', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء موظف جديد');
      }
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.editingId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف الموظف؟');
        if (!confirmed) return;
        await withToast(() => request(`/employees/${id}`, { method: 'DELETE' }), 'تم حذف الموظف');
        if (state.editingId === id) state.editingId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('emp-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderLeaveRequests() {
  setTitle('الإجازات');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل طلبات الإجازة...</div>';

  const load = async () => {
    const [leavesRes, employeesRes] = await Promise.all([request('/leaves'), request('/employees')]);
    const leaves = asArray(extractRows(leavesRes));
    const employees = asArray(extractRows(employeesRes));
    const employeesMap = new Map(employees.map((e) => [e.id, e.fullName]));

    view.innerHTML = `
      <div class="card">
        <h3>تقديم طلب إجازة</h3>
        <form id="leave-form" class="grid-3">
          <div><label>الموظف</label>
            <select id="lv-employee" required>
              <option value="">اختر الموظف</option>
              ${employees.map((e) => `<option value="${e.id}">${e.code} - ${e.fullName}</option>`).join('')}
            </select>
          </div>
          <div><label>نوع الإجازة</label><input id="lv-type" value="سنوية" required /></div>
          <div><label>من تاريخ</label><input id="lv-start" type="date" required /></div>
          <div><label>إلى تاريخ</label><input id="lv-end" type="date" required /></div>
          <div><label>عدد الأيام</label><input id="lv-days" type="number" min="1" value="1" required /></div>
          <div style="grid-column:1 / -1;"><label>السبب</label><textarea id="lv-reason" rows="2"></textarea></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ الطلب</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة الطلبات</h3>
        ${table(
          ['الموظف', 'النوع', 'من', 'إلى', 'الأيام', 'الحالة', 'الإجراءات'],
          leaves.map((r) => [
            employeesMap.get(r.employeeId) || r.employeeId || '-',
            r.type || '-',
            formatDate(r.startDate),
            formatDate(r.endDate),
            r.daysCount || 0,
            r.status || '-',
            `<div class="actions">
              ${r.status === 'PENDING' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${r.id}">اعتماد</button>` : ''}
              ${r.status === 'PENDING' ? `<button class="btn btn-warning btn-sm" data-action="reject" data-id="${r.id}">رفض</button>` : ''}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('leave-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        employeeId: Number(document.getElementById('lv-employee').value),
        type: document.getElementById('lv-type').value.trim(),
        startDate: toIsoDateTime(document.getElementById('lv-start').value),
        endDate: toIsoDateTime(document.getElementById('lv-end').value),
        daysCount: Number(document.getElementById('lv-days').value || 1),
        status: 'PENDING',
        reason: document.getElementById('lv-reason').value.trim() || undefined
      };
      await withToast(() => request('/leaves', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء طلب الإجازة');
      await load();
    });

    view.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/leaves/${id}/approve`, { method: 'POST' }), 'تم اعتماد طلب الإجازة');
        await load();
      });
    });
    view.querySelectorAll('[data-action="reject"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/leaves/${id}/reject`, { method: 'POST' }), 'تم رفض طلب الإجازة');
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف طلب الإجازة؟');
        if (!confirmed) return;
        await withToast(() => request(`/leaves/${id}`, { method: 'DELETE' }), 'تم حذف طلب الإجازة');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('leave-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderPayrollRuns() {
  setTitle('الرواتب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل كشوف الرواتب...</div>';
  const state = { selectedId: null, year: currentYear(), month: new Date().getMonth() + 1 };

  const load = async () => {
    const rows = asArray(extractRows(await request('/payroll')));
    const details = state.selectedId ? (await request(`/payroll/${state.selectedId}`)).data : null;
    const lines = asArray(details?.lines);

    view.innerHTML = `
      <div class="card">
        <h3>إنشاء كشف راتب شهري</h3>
        <form id="payroll-gen-form" class="grid-3">
          <div><label>السنة</label><input id="py-year" type="number" value="${state.year}" /></div>
          <div><label>الشهر</label><input id="py-month" type="number" min="1" max="12" value="${state.month}" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">إنشاء الكشف</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة كشوف الرواتب</h3>
        ${table(
          ['الكود', 'السنة', 'الشهر', 'الحالة', 'إجمالي الإجمالي', 'صافي الإجمالي', 'الإجراءات'],
          rows.map((r) => [
            r.code || '-',
            r.year || '-',
            r.month || '-',
            r.status || '-',
            formatMoney(r.grossTotal || 0),
            formatMoney(r.netTotal || 0),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${r.id}">تفاصيل</button>
              ${r.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${r.id}">اعتماد</button>` : ''}
              ${r.status === 'APPROVED' ? `<button class="btn btn-info btn-sm" data-action="post" data-id="${r.id}">ترحيل</button>` : ''}
              ${r.status === 'POSTED' ? `<button class="btn btn-primary btn-sm" data-action="pay" data-id="${r.id}">صرف</button>` : ''}
            </div>`
          ])
        )}
      </div>

      <div class="card">
        <h3>تفاصيل الكشف ${details?.code ? `- ${details.code}` : ''}</h3>
        ${
          details
            ? table(
                ['الموظف', 'أساسي', 'بدلات', 'إضافي', 'خصومات', 'الصافي'],
                lines.map((line) => [
                  line.employeeId || '-',
                  formatMoney(line.basicSalary || 0),
                  formatMoney(line.allowances || 0),
                  formatMoney(line.overtime || 0),
                  formatMoney(line.deductions || 0),
                  formatMoney(line.netSalary || 0)
                ])
              )
            : '<p class="muted">اختر كشفاً لعرض التفاصيل.</p>'
        }
      </div>
    `;

    document.getElementById('payroll-gen-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const year = Number(document.getElementById('py-year').value || currentYear());
      const month = Number(document.getElementById('py-month').value || 1);
      await withToast(() => request('/payroll/generate', { method: 'POST', body: JSON.stringify({ year, month }) }), 'تم إنشاء كشف الرواتب');
      state.year = year;
      state.month = month;
      await load();
    });

    view.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.selectedId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/payroll/${id}/approve`, { method: 'POST' }), 'تم اعتماد الكشف');
        await load();
      });
    });
    view.querySelectorAll('[data-action="post"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/payroll/${id}/post`, { method: 'POST' }), 'تم ترحيل قيد الرواتب');
        await load();
      });
    });
    view.querySelectorAll('[data-action="pay"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/payroll/${id}/pay`, { method: 'POST' }), 'تم صرف الرواتب');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('payroll-gen-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderContracts() {
  setTitle('العقود');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل العقود...</div>';
  const state = { editingId: null };

  const load = async () => {
    const rows = asArray(extractRows(await request('/contracts')));
    const editing = state.editingId ? rows.find((r) => r.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل عقد' : 'إضافة عقد'}</h3>
        <form id="contract-form" class="grid-3">
          <div><label>رقم العقد</label><input id="co-number" required value="${editing?.number || ''}" /></div>
          <div><label>العنوان</label><input id="co-title" required value="${editing?.title || ''}" /></div>
          <div><label>نوع الطرف</label><input id="co-partyType" required value="${editing?.partyType || 'CUSTOMER'}" /></div>
          <div><label>معرف الطرف</label><input id="co-partyId" type="number" value="${editing?.partyId || ''}" /></div>
          <div><label>النوع</label><input id="co-type" value="${editing?.type || ''}" /></div>
          <div><label>تاريخ البداية</label><input id="co-start" type="date" required value="${editing?.startDate ? String(editing.startDate).slice(0, 10) : todayIso()}" /></div>
          <div><label>تاريخ النهاية</label><input id="co-end" type="date" value="${editing?.endDate ? String(editing.endDate).slice(0, 10) : ''}" /></div>
          <div><label>القيمة</label><input id="co-value" type="number" step="0.01" value="${editing?.value || 0}" /></div>
          <div><label>الحالة</label><input id="co-status" value="${editing?.status || 'DRAFT'}" /></div>
          <div style="grid-column:1 / -1;"><label>الشروط</label><textarea id="co-terms" rows="2">${editing?.terms || ''}</textarea></div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="co-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة العقود</h3>
        ${table(
          ['الرقم', 'العنوان', 'النوع', 'القيمة', 'الحالة', 'الإجراءات'],
          rows.map((r) => [
            r.number || '-',
            r.title || '-',
            r.partyType || '-',
            formatMoney(r.value || 0),
            r.status || '-',
            `<div class="actions">
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${r.id}">تعديل</button>
              ${r.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${r.id}">اعتماد</button>` : ''}
              ${['APPROVED', 'RENEWED'].includes(String(r.status)) ? `<button class="btn btn-info btn-sm" data-action="renew" data-id="${r.id}">تجديد</button>` : ''}
              ${r.status !== 'TERMINATED' ? `<button class="btn btn-danger btn-sm" data-action="terminate" data-id="${r.id}">إنهاء</button>` : ''}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('co-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('contract-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        number: document.getElementById('co-number').value.trim(),
        title: document.getElementById('co-title').value.trim(),
        partyType: document.getElementById('co-partyType').value.trim(),
        partyId: document.getElementById('co-partyId').value ? Number(document.getElementById('co-partyId').value) : undefined,
        type: document.getElementById('co-type').value.trim() || undefined,
        startDate: toIsoDateTime(document.getElementById('co-start').value),
        endDate: toIsoDateTime(document.getElementById('co-end').value),
        value: Number(document.getElementById('co-value').value || 0),
        status: document.getElementById('co-status').value.trim() || 'DRAFT',
        terms: document.getElementById('co-terms').value.trim() || undefined
      };
      if (state.editingId) {
        await withToast(() => request(`/contracts/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث العقد');
      } else {
        await withToast(() => request('/contracts', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء العقد');
      }
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.editingId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/contracts/${id}/approve`, { method: 'POST' }), 'تم اعتماد العقد');
        await load();
      });
    });
    view.querySelectorAll('[data-action="renew"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const monthsRaw = window.prompt('عدد أشهر التجديد', '12');
        const months = Number(monthsRaw || 12);
        await withToast(() => request(`/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify({ months }) }), 'تم تجديد العقد');
        await load();
      });
    });
    view.querySelectorAll('[data-action="terminate"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد إنهاء العقد؟');
        if (!confirmed) return;
        await withToast(() => request(`/contracts/${id}/terminate`, { method: 'POST' }), 'تم إنهاء العقد');
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف العقد؟');
        if (!confirmed) return;
        await withToast(() => request(`/contracts/${id}`, { method: 'DELETE' }), 'تم حذف العقد');
        if (state.editingId === id) state.editingId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('contract-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderContractMilestones() {
  setTitle('مراحل العقود');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مراحل العقود...</div>';
  const state = { contractId: '', editingId: null };

  const load = async () => {
    const contracts = asArray(extractRows(await request('/contracts')));
    if (!state.contractId && contracts.length) state.contractId = String(contracts[0].id);
    const rows = state.contractId ? asArray(extractRows(await request(`/contracts/${state.contractId}/milestones${toQuery({ limit: 200 })}`))) : [];
    const editing = state.editingId ? rows.find((r) => r.id === state.editingId) : null;

    view.innerHTML = `
      <div class="card">
        <h3>${editing ? 'تعديل مرحلة' : 'إضافة مرحلة'}</h3>
        <form id="ms-form" class="grid-3">
          <div><label>العقد</label>
            <select id="ms-contract">
              ${contracts.map((c) => `<option value="${c.id}" ${String(c.id) === String(state.contractId) ? 'selected' : ''}>${c.number} - ${c.title}</option>`).join('')}
            </select>
          </div>
          <div><label>العنوان</label><input id="ms-title" required value="${editing?.title || ''}" /></div>
          <div><label>تاريخ الاستحقاق</label><input id="ms-due" type="date" value="${editing?.dueDate ? String(editing.dueDate).slice(0, 10) : ''}" /></div>
          <div><label>المبلغ</label><input id="ms-amount" type="number" step="0.01" value="${editing?.amount || 0}" /></div>
          <div><label>الحالة</label><input id="ms-status" value="${editing?.status || 'PENDING'}" /></div>
          <div style="grid-column:1 / -1;"><label>ملاحظات</label><textarea id="ms-notes" rows="2">${editing?.notes || ''}</textarea></div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${editing ? 'تحديث' : 'حفظ'}</button>
            <button id="ms-reset" class="btn btn-secondary" type="button">إعادة تعيين</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة المراحل</h3>
        ${table(
          ['العنوان', 'تاريخ الاستحقاق', 'المبلغ', 'الحالة', 'الإجراءات'],
          rows.map((r) => [
            r.title || '-',
            formatDate(r.dueDate),
            formatMoney(r.amount || 0),
            r.status || '-',
            `<div class="actions">
              <button class="btn btn-warning btn-sm" data-action="edit" data-id="${r.id}">تعديل</button>
              ${r.status !== 'COMPLETED' ? `<button class="btn btn-success btn-sm" data-action="complete" data-id="${r.id}">إكمال</button>` : ''}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('ms-contract')?.addEventListener('change', async (event) => {
      state.contractId = event.target.value;
      state.editingId = null;
      await load();
    });
    document.getElementById('ms-reset')?.addEventListener('click', async () => {
      state.editingId = null;
      await load();
    });

    document.getElementById('ms-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const contractId = Number(document.getElementById('ms-contract').value);
      const payload = {
        title: document.getElementById('ms-title').value.trim(),
        dueDate: toIsoDateTime(document.getElementById('ms-due').value),
        amount: Number(document.getElementById('ms-amount').value || 0),
        status: document.getElementById('ms-status').value.trim() || 'PENDING',
        notes: document.getElementById('ms-notes').value.trim() || undefined
      };
      if (state.editingId) {
        await withToast(() => request(`/milestones/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث المرحلة');
      } else {
        await withToast(() => request(`/contracts/${contractId}/milestones`, { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المرحلة');
      }
      state.contractId = String(contractId);
      state.editingId = null;
      await load();
    });

    view.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.editingId = Number(btn.getAttribute('data-id'));
        await load();
      });
    });
    view.querySelectorAll('[data-action="complete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/milestones/${id}/complete`, { method: 'POST' }), 'تم إكمال المرحلة');
        await load();
      });
    });
    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف المرحلة؟');
        if (!confirmed) return;
        await withToast(() => request(`/milestones/${id}`, { method: 'DELETE' }), 'تم حذف المرحلة');
        if (state.editingId === id) state.editingId = null;
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('ms-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
