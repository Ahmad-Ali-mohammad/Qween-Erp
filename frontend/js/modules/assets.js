import { request, withToast, extractRows } from '../core/api.js';
import { setTitle, table, formatMoney, formatDate, statusBadge, confirmAction, setPageActions } from '../core/ui.js';

export async function renderAssets(mode = 'assets') {
  if (mode === 'categories') return renderCategories();
  if (mode === 'depreciation') return renderDepreciation();
  if (mode === 'disposal') return renderDisposal();
  if (mode === 'reports') return renderReports();
  return renderAssetCards();
}

function resolveFiscalYearNumber(yearRows) {
  const nowYear = new Date().getUTCFullYear();
  const current = yearRows.find((y) => y.isCurrent) || yearRows.find((y) => y.status === 'OPEN') || yearRows[0];
  if (!current) return nowYear;

  if (current.startDate) {
    const start = new Date(current.startDate);
    if (!Number.isNaN(start.getTime())) return start.getUTCFullYear();
  }

  const parsedFromName = Number.parseInt(String(current.name || ''), 10);
  if (Number.isFinite(parsedFromName) && parsedFromName > 0) return parsedFromName;

  return nowYear;
}

function formatDepMethod(method) {
  const value = String(method || '').toUpperCase();
  if (value === 'STRAIGHTLINE') return 'القسط الثابت';
  if (value === 'DECLININGBALANCE') return 'الرصيد المتناقص';
  return method || '-';
}

function formatWorkflowStatus(status) {
  const value = String(status || '').toUpperCase();
  if (!value) return '-';
  if (value === 'PENDING') return 'قيد الانتظار';
  if (value === 'POSTED') return 'مرحل';
  if (value === 'COMPLETED') return 'مكتمل';
  return status;
}

async function renderCategories() {
  setTitle('تصنيفات الأصول');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تصنيفات الأصول...</div>';

  const load = async () => {
    const rows = extractRows(await request('/asset-categories'));

    view.innerHTML = `
      <div class="card">
        <h3>إضافة تصنيف أصل جديد</h3>
        <form id="cat-form" class="grid-3">
          <div><label>كود التصنيف</label><input id="cat-code" required /></div>
          <div><label>اسم التصنيف</label><input id="cat-name" required /></div>
          <div><label>العمر الإنتاجي (بالأشهر)</label><input id="cat-life" type="number" min="1" value="60" /></div>
          <div><label>طريقة الإهلاك</label><input id="cat-method" value="StraightLine" /></div>
          <div><label>نسبة القيمة المتبقية (%)</label><input id="cat-salvage" type="number" min="0" step="0.01" value="0" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ التصنيف</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة تصنيفات الأصول</h3>
        ${table(
          ['الكود', 'الاسم', 'طريقة الإهلاك', 'العمر الإنتاجي', 'القيمة المتبقية', 'الإجراءات'],
          rows.map((c) => [
            c.code,
            c.nameAr,
            formatDepMethod(c.depreciationMethod),
            `${c.usefulLifeMonths} شهر`,
            `${c.salvagePercent}%`,
            `<div class="actions"><button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">حذف</button></div>`
          ])
        )}
      </div>
    `;

    document.getElementById('cat-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('cat-code').value.trim(),
        nameAr: document.getElementById('cat-name').value.trim(),
        usefulLifeMonths: Number(document.getElementById('cat-life').value || 60),
        depreciationMethod: document.getElementById('cat-method').value.trim() || 'StraightLine',
        salvagePercent: Number(document.getElementById('cat-salvage').value || 0)
      };

      await withToast(() => request('/asset-categories', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ تصنيف الأصل');
      await load();
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف تصنيف الأصل؟');
        if (!confirmed) return;
        await withToast(() => request(`/asset-categories/${id}`, { method: 'DELETE' }), 'تم حذف تصنيف الأصل');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('cat-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderAssetCards() {
  setTitle('بطاقات الأصول');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل بطاقات الأصول...</div>';

  const load = async () => {
    const [assetsRes, catsRes] = await Promise.all([request('/assets'), request('/asset-categories')]);
    const assets = extractRows(assetsRes);
    const categories = extractRows(catsRes);

    view.innerHTML = `
      <div class="card">
        <h3>إضافة بطاقة أصل ثابت</h3>
        <form id="asset-form" class="grid-3">
          <div><label>كود الأصل</label><input id="as-code" required /></div>
          <div><label>اسم الأصل</label><input id="as-name" required /></div>
          <div><label>التصنيف</label>
            <select id="as-category" required>
              <option value="">اختر التصنيف</option>
              ${categories.map((c) => `<option value="${c.id}">${c.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>تاريخ الشراء</label><input id="as-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
          <div><label>تكلفة الشراء</label><input id="as-cost" type="number" min="0.01" step="0.01" value="0" /></div>
          <div><label>قيمة الخردة المتوقعة</label><input id="as-salvage" type="number" min="0" step="0.01" value="0" /></div>
          <div><label>الموقع</label><input id="as-location" placeholder="مثال: الرياض - المستودع الرئيسي" /></div>
          <div style="grid-column:1 / -1;"><label>ملاحظات</label><input id="as-notes" /></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ بطاقة الأصل</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة الأصول الثابتة</h3>
        ${table(
          ['الكود', 'اسم الأصل', 'التصنيف', 'تكلفة الشراء', 'صافي القيمة الدفترية', 'الحالة', 'إجراءات'],
          assets.map((a) => [
            a.code,
            a.nameAr,
            a.category?.nameAr || '-',
            formatMoney(a.purchaseCost),
            formatMoney(a.netBookValue),
            statusBadge(a.status),
            `<div class="actions">
              <button class="btn btn-secondary btn-sm" data-action="view" data-id="${a.id}">تفاصيل</button>
              <button class="btn btn-info btn-sm" data-action="dispose" data-id="${a.id}">صرف</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${a.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('asset-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('as-code').value.trim(),
        nameAr: document.getElementById('as-name').value.trim(),
        categoryId: Number(document.getElementById('as-category').value),
        purchaseDate: document.getElementById('as-date').value,
        purchaseCost: Number(document.getElementById('as-cost').value || 0),
        salvageValue: Number(document.getElementById('as-salvage').value || 0),
        location: document.getElementById('as-location').value.trim() || undefined,
        notes: document.getElementById('as-notes').value.trim() || undefined
      };

      await withToast(() => request('/assets', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ بطاقة الأصل بنجاح');
      await load();
    });

    view.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const details = await request(`/assets/${id}`);
        const asset = details.data || {};
        const schedules = Array.isArray(asset.depreciationSchedule) ? asset.depreciationSchedule : [];
        alert(
          `الأصل: ${asset.nameAr || '-'}\n` +
            `تكلفة الشراء: ${formatMoney(asset.purchaseCost || 0)}\n` +
            `صافي القيمة الدفترية: ${formatMoney(asset.netBookValue || 0)}\n` +
            `عدد سجلات الإهلاك: ${schedules.length}`
        );
      });
    });

    view.querySelectorAll('[data-action="dispose"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const salePrice = Number(window.prompt('أدخل قيمة البيع (0 في حالة الاستبعاد)', '0') || 0);
        await withToast(
          () =>
            request(`/assets/${id}/dispose`, {
              method: 'POST',
              body: JSON.stringify({ salePrice, reason: 'صرف الأصل من واجهة المستخدم' })
            }),
          'تم تنفيذ صرف الأصل بنجاح'
        );
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم حذف بطاقة الأصل نهائياً. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/assets/${id}`, { method: 'DELETE' }), 'تم حذف بطاقة الأصل');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('asset-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderDepreciation() {
  setTitle('جداول الإهلاك');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل جداول الإهلاك...</div>';

  const load = async () => {
    const [scheduleRes, fiscalYearsRes] = await Promise.all([request('/depreciation'), request('/fiscal-years')]);
    const rows = extractRows(scheduleRes);
    const years = extractRows(fiscalYearsRes);
    const currentYear = resolveFiscalYearNumber(years);

    view.innerHTML = `
      <div class="card">
        <h3>تشغيل احتساب الإهلاك</h3>
        <form id="dep-form" class="grid-3">
          <div><label>السنة المالية</label><input id="dep-year" type="number" value="${currentYear}" /></div>
          <div><label>الفترة (1-12)</label><input id="dep-period" type="number" min="1" max="12" value="${new Date().getMonth() + 1}" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">تشغيل الاحتساب</button></div>
        </form>
      </div>

      <div class="card">
        <h3>سجلات الإهلاك</h3>
        ${table(
          ['الأصل', 'السنة', 'الفترة', 'الرصيد الافتتاحي', 'مصروف الإهلاك', 'مجمع الإهلاك', 'الرصيد الختامي', 'الحالة'],
          rows.map((r) => [
            r.asset?.nameAr || `#${r.assetId}`,
            r.fiscalYear,
            r.period,
            formatMoney(r.openingNBV),
            formatMoney(r.expense),
            formatMoney(r.accumulated),
            formatMoney(r.closingNBV),
            statusBadge(r.status || 'PENDING')
          ])
        )}
      </div>
    `;

    document.getElementById('dep-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        fiscalYear: Number(document.getElementById('dep-year').value),
        period: Number(document.getElementById('dep-period').value)
      };

      await withToast(() => request('/depreciation/run', { method: 'POST', body: JSON.stringify(payload) }), 'تم تشغيل احتساب الإهلاك بنجاح');
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('dep-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderDisposal() {
  setTitle('صرف الأصول');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل صفحة صرف الأصول الثابتة...</div>';

  const load = async () => {
    const rows = extractRows(await request('/assets')).filter((a) => !['SOLD', 'SCRAPPED'].includes(String(a.status || '').toUpperCase()));

    view.innerHTML = `
      <div class="card">
        <h3>صرف الأصول الثابتة</h3>
        <p class="muted">اختر الأصل ثم أدخل قيمة البيع (أو 0 في حالة الاستبعاد) ليتم إنشاء قيد الصرف تلقائياً.</p>
        ${table(
          ['الكود', 'اسم الأصل', 'صافي القيمة الدفترية', 'الحالة', 'الإجراء'],
          rows.map((a) => [
            a.code,
            a.nameAr,
            formatMoney(a.netBookValue),
            statusBadge(a.status),
            `<button class="btn btn-info btn-sm" data-dispose="${a.id}">صرف الأصل</button>`
          ])
        )}
      </div>
    `;

    view.querySelectorAll('[data-dispose]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-dispose'));
        const salePrice = Number(window.prompt('أدخل قيمة البيع (0 في حالة الاستبعاد)', '0') || 0);
        const reason = window.prompt('سبب الصرف', 'صرف أصل من شاشة صرف الأصول') || 'صرف أصل من شاشة صرف الأصول';
        await withToast(
          () => request(`/assets/${id}/dispose`, { method: 'POST', body: JSON.stringify({ salePrice, reason }) }),
          'تم تنفيذ صرف الأصل'
        );
        await load();
      });
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderReports() {
  setTitle('تقارير الأصول الثابتة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تقارير الأصول الثابتة...</div>';

  const load = async () => {
    const [fixedAssetsRes, depreciationRes] = await Promise.all([request('/reports/fixed-assets'), request('/reports/depreciation')]);
    const fixedAssetsData = fixedAssetsRes.data || {};
    const summary = fixedAssetsData.summary || {};
    const assetRows = Array.isArray(fixedAssetsData.rows) ? fixedAssetsData.rows : extractRows(fixedAssetsRes);
    const depreciationRows = extractRows(depreciationRes);

    view.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الأصول</div><div class="val">${summary.assets || 0}</div></div>
        <div class="kpi"><div>إجمالي تكلفة الشراء</div><div class="val">${formatMoney(summary.purchaseCost || 0)}</div></div>
        <div class="kpi"><div>مجمع الإهلاك</div><div class="val">${formatMoney(summary.accumulatedDepreciation || 0)}</div></div>
        <div class="kpi"><div>صافي القيمة الدفترية</div><div class="val">${formatMoney(summary.netBookValue || 0)}</div></div>
      </div>

      <div class="card">
        <h3>تقرير الأصول الثابتة</h3>
        ${table(
          ['الكود', 'اسم الأصل', 'التصنيف', 'تكلفة الشراء', 'مجمع الإهلاك', 'صافي القيمة الدفترية', 'الحالة'],
          assetRows.map((a) => [
            a.code,
            a.nameAr,
            a.category?.nameAr || '-',
            formatMoney(a.purchaseCost),
            formatMoney(a.accumulatedDepreciation),
            formatMoney(a.netBookValue),
            statusBadge(a.status)
          ])
        )}
      </div>

      <div class="card">
        <h3>تقرير الإهلاك</h3>
        ${table(
          ['الأصل', 'السنة', 'الفترة', 'مصروف الإهلاك', 'الرصيد الختامي', 'الحالة'],
          depreciationRows.map((r) => [
            r.asset?.nameAr || r.assetId || '-',
            r.fiscalYear,
            r.period,
            formatMoney(r.expense),
            formatMoney(r.closingNBV),
            formatWorkflowStatus(r.status || 'PENDING')
          ])
        )}
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}
