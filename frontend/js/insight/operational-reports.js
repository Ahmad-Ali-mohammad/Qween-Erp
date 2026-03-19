import { api, extractData, toQuery } from '../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table } from '../core/ui.js';
import { downloadCsv } from '../flows/shared/section-helpers.js';

export async function renderSalesReportsPage() {
  setTitle('تقارير المبيعات');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/sales${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="sales-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="sales-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
        <div class="kpi"><div>الإجمالي</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
        <div class="kpi"><div>المسدّد</div><div class="val">${formatMoney(summary.paid || 0)}</div></div>
        <div class="kpi"><div>المتبقي</div><div class="val">${formatMoney(summary.outstanding || 0)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
          rows.map((row) => [row.number, row.customer?.nameAr || '-', formatDate(row.date), formatMoney(row.total), formatMoney(row.outstanding), statusBadge(row.status)])
        )}
      </div>
    `;

    document.getElementById('sales-report-filter')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('sales-export')?.addEventListener('click', () => {
      downloadCsv(
        'sales-report.csv',
        ['Invoice', 'Customer', 'Date', 'Total', 'Outstanding', 'Status'],
        rows.map((row) => [row.number, row.customer?.nameAr || '', formatDate(row.date), row.total, row.outstanding, row.status])
      );
    });
  };

  await load();
}

export async function renderPurchaseReportsPage() {
  setTitle('تقارير المشتريات');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/purchases${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="purchase-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="purchase-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الفواتير</div><div class="val">${summary.count || 0}</div></div>
        <div class="kpi"><div>إجمالي المشتريات</div><div class="val">${formatMoney(summary.total || 0)}</div></div>
        <div class="kpi"><div>مرتجعات</div><div class="val">${formatMoney(summary.purchaseReturnsTotal || 0)}</div></div>
        <div class="kpi"><div>صافي المشتريات</div><div class="val">${formatMoney(summary.netPurchases || 0)}</div></div>
      </div>
      <div class="card">
        ${table(
          ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي', 'المتبقي', 'الحالة'],
          rows.map((row) => [row.number, row.supplier?.nameAr || '-', formatDate(row.date), formatMoney(row.total), formatMoney(row.outstanding), statusBadge(row.status)])
        )}
      </div>
    `;

    document.getElementById('purchase-report-filter')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('purchase-export')?.addEventListener('click', () => {
      downloadCsv(
        'purchase-report.csv',
        ['Invoice', 'Supplier', 'Date', 'Total', 'Outstanding', 'Status'],
        rows.map((row) => [row.number, row.supplier?.nameAr || '', formatDate(row.date), row.total, row.outstanding, row.status])
      );
    });
  };

  await load();
}

export async function renderInventoryReportsPage() {
  setTitle('تقارير المخزون');
  setPageActions({});
  const view = document.getElementById('view');
  const state = {
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  };

  const load = async () => {
    const res = await api(`/reports/inventory${toQuery({ dateFrom: state.dateFrom, dateTo: state.dateTo })}`);
    const payload = extractData(res) || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];

    view.innerHTML = `
      <div class="card">
        <form id="inventory-report-filter" class="grid cols-3">
          <div><label>من تاريخ</label><input name="dateFrom" type="date" value="${state.dateFrom}" /></div>
          <div><label>إلى تاريخ</label><input name="dateTo" type="date" value="${state.dateTo}" /></div>
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <button class="btn btn-primary" type="submit">تطبيق</button>
            <button class="btn btn-secondary" id="inventory-export" type="button">تصدير CSV</button>
          </div>
        </form>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div>عدد الأصناف</div><div class="val">${summary.items || 0}</div></div>
        <div class="kpi"><div>إجمالي الكمية</div><div class="val">${summary.totalQty || 0}</div></div>
        <div class="kpi"><div>قيمة المخزون</div><div class="val">${formatMoney(summary.totalValue || 0)}</div></div>
        <div class="kpi"><div>أصناف تحت الحد</div><div class="val">${summary.belowReorder || 0}</div></div>
      </div>
      <div class="card">
        ${table(
          ['الكود', 'الصنف', 'الكمية', 'القيمة', 'حد إعادة الطلب'],
          rows.map((row) => [row.code, row.nameAr, Number(row.onHandQty || 0), formatMoney(row.inventoryValue || 0), Number(row.reorderPoint || 0)])
        )}
      </div>
    `;

    document.getElementById('inventory-report-filter')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      state.dateFrom = form.dateFrom.value || state.dateFrom;
      state.dateTo = form.dateTo.value || state.dateTo;
      await load();
    });

    document.getElementById('inventory-export')?.addEventListener('click', () => {
      downloadCsv(
        'inventory-report.csv',
        ['Code', 'Name', 'Qty', 'Value', 'ReorderPoint'],
        rows.map((row) => [row.code, row.nameAr, row.onHandQty, row.inventoryValue, row.reorderPoint])
      );
    });
  };

  await load();
}
