import { request, withToast, toQuery } from '../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, confirmAction, setPageActions } from '../core/ui.js';

export async function renderTaxes(mode = 'codes') {
  if (mode === 'categories') return renderCategories();
  if (mode === 'zatca') return renderZatca();
  if (mode === 'reports') return renderTaxReports();
  if (mode === 'declarations') return renderDeclarations();
  return renderCodes();
}

async function renderCodes() {
  setTitle('أكواد الضرائب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل أكواد الضرائب...</div>';

  const load = async () => {
    const rows = (await request('/tax-codes')).data || [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة كود ضريبي</h3>
        <form id="tax-code-form" class="grid-3">
          <div><label>الكود</label><input id="tc-code" required /></div>
          <div><label>الاسم</label><input id="tc-name" required /></div>
          <div><label>النوع</label><select id="tc-type"><option value="VAT">VAT</option><option value="WHT">WHT</option></select></div>
          <div><label>النسبة %</label><input id="tc-rate" type="number" min="0" step="0.01" value="15" /></div>
          <div><label><input id="tc-rec" type="checkbox" checked /> قابلة للاسترداد</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        ${table(
          ['الكود', 'الاسم', 'النوع', 'النسبة', 'استرداد', 'إجراءات'],
          rows.map((r) => [
            r.code,
            r.nameAr,
            r.type,
            `${r.rate}%`,
            r.isRecoverable ? 'نعم' : 'لا',
            `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('tax-code-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('tc-code').value.trim(),
        nameAr: document.getElementById('tc-name').value.trim(),
        type: document.getElementById('tc-type').value,
        rate: Number(document.getElementById('tc-rate').value || 0),
        isRecoverable: document.getElementById('tc-rec').checked,
        isActive: true
      };
      await withToast(() => request('/tax-codes', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ الكود الضريبي');
      await load();
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('تأكيد حذف الكود الضريبي؟');
        if (!confirmed) return;
        await withToast(() => request(`/tax-codes/${id}`, { method: 'DELETE' }), 'تم حذف الكود الضريبي');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('tax-code-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderDeclarations() {
  setTitle('الإقرارات الضريبية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الإقرارات...</div>';

  const load = async () => {
    const rows = (await request('/tax-declarations')).data || [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة إقرار ضريبي</h3>
        <form id="tax-dec-form" class="grid-3">
          <div><label>من تاريخ</label><input id="td-start" type="date" required /></div>
          <div><label>إلى تاريخ</label><input id="td-end" type="date" required /></div>
          <div><label>النوع</label><select id="td-type"><option value="VAT">VAT</option><option value="WHT">WHT</option></select></div>
          <div><label>مبيعات</label><input id="td-sales" type="number" step="0.01" value="0" /></div>
          <div><label>مشتريات</label><input id="td-purchases" type="number" step="0.01" value="0" /></div>
          <div><label>ضريبة مخرجات</label><input id="td-output" type="number" step="0.01" value="0" /></div>
          <div><label>ضريبة مدخلات</label><input id="td-input" type="number" step="0.01" value="0" /></div>
          <div><label>صافي مستحق</label><input id="td-net" type="number" step="0.01" value="0" /></div>
          <div><label>الحالة</label><select id="td-status"><option>DRAFT</option><option>FILED</option><option>PAID</option><option>CANCELLED</option></select></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        ${table(
          ['من', 'إلى', 'النوع', 'المبيعات', 'المشتريات', 'الصافي', 'الحالة', 'إجراءات'],
          rows.map((r) => [
            formatDate(r.periodStart),
            formatDate(r.periodEnd),
            r.type,
            formatMoney(r.totalSales),
            formatMoney(r.totalPurchases),
            formatMoney(r.netPayable),
            statusBadge(r.status),
            `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('tax-dec-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        periodStart: document.getElementById('td-start').value,
        periodEnd: document.getElementById('td-end').value,
        type: document.getElementById('td-type').value,
        totalSales: Number(document.getElementById('td-sales').value || 0),
        totalPurchases: Number(document.getElementById('td-purchases').value || 0),
        outputTax: Number(document.getElementById('td-output').value || 0),
        inputTax: Number(document.getElementById('td-input').value || 0),
        netPayable: Number(document.getElementById('td-net').value || 0),
        status: document.getElementById('td-status').value
      };
      await withToast(() => request('/tax-declarations', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ الإقرار الضريبي');
      await load();
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('تأكيد حذف الإقرار؟');
        if (!confirmed) return;
        await withToast(() => request(`/tax-declarations/${id}`, { method: 'DELETE' }), 'تم حذف الإقرار');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('tax-dec-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderCategories() {
  setTitle('فئات الضرائب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل فئات الضرائب...</div>';

  const load = async () => {
    const res = await request('/tax-categories');
    const payload = res.data;
    const categories = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.categories)
        ? payload.categories
        : [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة فئة ضريبية</h3>
        <form id="tax-category-form" class="grid-3">
          <div><label>الكود</label><input id="cat-code" required /></div>
          <div><label>الاسم</label><input id="cat-name" required /></div>
          <div><label>النسبة %</label><input id="cat-rate" type="number" min="0" step="0.01" value="0" /></div>
          <div><label><input id="cat-active" type="checkbox" checked /> نشطة</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">إضافة</button></div>
        </form>
      </div>
      <div class="card">
        ${table(
          ['الكود', 'الاسم', 'النسبة', 'الحالة', 'إجراءات'],
          categories.map((c, index) => [
            c.code,
            c.nameAr,
            `${Number(c.rate || 0)}%`,
            c.isActive ? statusBadge('ACTIVE') : statusBadge('DRAFT'),
            `<button class="btn btn-danger btn-sm" data-delete="${index}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('tax-category-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const next = [
        ...categories,
        {
          code: document.getElementById('cat-code').value.trim().toUpperCase(),
          nameAr: document.getElementById('cat-name').value.trim(),
          rate: Number(document.getElementById('cat-rate').value || 0),
          isActive: document.getElementById('cat-active').checked
        }
      ];
      await withToast(() => request('/tax-categories', { method: 'PUT', body: JSON.stringify({ categories: next }) }), 'تم حفظ الفئات الضريبية');
      await load();
    });

    view.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-delete'));
        const confirmed = await confirmAction('تأكيد حذف الفئة؟');
        if (!confirmed) return;
        const next = categories.filter((_row, index) => index !== idx);
        await withToast(() => request('/tax-categories', { method: 'PUT', body: JSON.stringify({ categories: next }) }), 'تم حذف الفئة');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('tax-category-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderZatca() {
  setTitle('تكامل ZATCA');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل إعدادات ZATCA...</div>';

  const load = async () => {
    const res = await request('/zatca');
    const row = res.data || {};
    const settings = row.settings || {};

    view.innerHTML = `
      <div class="card">
        <h3>إعدادات ZATCA</h3>
        <form id="zatca-form" class="grid-2">
          <div><label><input id="zatca-enabled" type="checkbox" ${row.isEnabled ? 'checked' : ''} /> تفعيل التكامل</label></div>
          <div><label>البيئة</label>
            <select id="zatca-environment">
              <option value="sandbox" ${settings.environment === 'sandbox' ? 'selected' : ''}>Sandbox</option>
              <option value="production" ${settings.environment === 'production' ? 'selected' : ''}>Production</option>
            </select>
          </div>
          <div><label>الرابط</label><input id="zatca-endpoint" value="${settings.endpoint || ''}" placeholder="https://..." /></div>
          <div><label>OTP</label><input id="zatca-otp" value="${settings.otp || ''}" /></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div>
        </form>
      </div>
    `;

    document.getElementById('zatca-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        isEnabled: document.getElementById('zatca-enabled').checked,
        environment: document.getElementById('zatca-environment').value,
        endpoint: document.getElementById('zatca-endpoint').value.trim() || '',
        otp: document.getElementById('zatca-otp').value.trim() || ''
      };
      await withToast(() => request('/zatca', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ إعدادات ZATCA');
      await load();
    });

    setPageActions({ onSave: () => document.getElementById('zatca-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderTaxReports() {
  setTitle('تقارير الضرائب');
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await request(`/tax-reports${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const summary = res.data?.summary || {};
    const rows = res.data?.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="tax-report-filter" class="grid-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">تطبيق</button></div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الإقرارات</div><div class="val">${summary.declarations || 0}</div></div>
        <div class="kpi"><div>مبيعات</div><div class="val">${formatMoney(summary.totalSales || 0)}</div></div>
        <div class="kpi"><div>مشتريات</div><div class="val">${formatMoney(summary.totalPurchases || 0)}</div></div>
        <div class="kpi"><div>صافي مستحق</div><div class="val">${formatMoney(summary.netPayable || 0)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['من', 'إلى', 'النوع', 'ضريبة مخرجات', 'ضريبة مدخلات', 'الصافي', 'الحالة'],
          rows.map((r) => [
            formatDate(r.periodStart),
            formatDate(r.periodEnd),
            r.type,
            formatMoney(r.outputTax),
            formatMoney(r.inputTax),
            formatMoney(r.netPayable),
            statusBadge(r.status)
          ])
        )}
      </div>
    `;

    document.getElementById('tax-report-filter').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}
