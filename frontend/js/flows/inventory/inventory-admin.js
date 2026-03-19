import { api, extractRows, withToast } from '../../core/api.js';
import { formatDate, formatMoney, setPageActions, setTitle, statusBadge, table } from '../../core/ui.js';
import { escapeHtml, renderSimpleCrud } from '../shared/section-helpers.js';

export async function renderItems() {
  await renderSimpleCrud('/items', 'الأصناف', [
    { key: 'code', label: 'الكود', required: true },
    { key: 'nameAr', label: 'الاسم', required: true },
    { key: 'salePrice', label: 'سعر البيع', type: 'number', defaultValue: 0 },
    { key: 'purchasePrice', label: 'سعر الشراء', type: 'number', defaultValue: 0 },
    { key: 'reorderPoint', label: 'حد إعادة الطلب', type: 'number', defaultValue: 0 },
    { key: 'minStock', label: 'حد أدنى', type: 'number', defaultValue: 0 },
    { key: 'maxStock', label: 'حد أقصى', type: 'number', defaultValue: 0 },
    { key: 'onHandQty', label: 'كمية حالية', type: 'number', defaultValue: 0 },
    { key: 'inventoryValue', label: 'قيمة المخزون', type: 'number', defaultValue: 0 },
    { key: 'isActive', label: 'نشط', type: 'checkbox', defaultValue: true }
  ]);
}

export async function renderItemCategories() {
  await renderSimpleCrud('/item-categories', 'تصنيفات الأصناف', [
    { key: 'code', label: 'الكود', required: true },
    { key: 'nameAr', label: 'الاسم', required: true },
    { key: 'isActive', label: 'نشط', type: 'checkbox', defaultValue: true }
  ]);
}

export async function renderUnits() {
  await renderSimpleCrud('/units', 'الوحدات', [
    { key: 'code', label: 'الكود', required: true },
    { key: 'nameAr', label: 'الاسم', required: true },
    { key: 'isActive', label: 'نشط', type: 'checkbox', defaultValue: true }
  ]);
}

export async function renderWarehouses() {
  await renderSimpleCrud('/warehouses', 'المستودعات', [
    { key: 'code', label: 'الكود', required: true },
    { key: 'nameAr', label: 'الاسم', required: true },
    { key: 'location', label: 'الموقع' },
    { key: 'manager', label: 'المسؤول' },
    { key: 'isActive', label: 'نشط', type: 'checkbox', defaultValue: true }
  ]);
}

export async function renderStockCounts() {
  setTitle('جرد المخزون');
  setPageActions({});
  const view = document.getElementById('view');

  const [countsRes, warehousesRes, itemsRes] = await Promise.all([api('/stock-counts'), api('/warehouses'), api('/items')]);
  const counts = extractRows(countsRes);
  const warehouses = extractRows(warehousesRes);
  const items = extractRows(itemsRes);
  const warehouseNames = new Map(warehouses.map((warehouse) => [warehouse.id, `${warehouse.code} - ${warehouse.nameAr}`]));

  view.innerHTML = `
    <div class="card">
      <h3>إنشاء جرد</h3>
      <form id="count-form" class="grid cols-2">
        <div><label>رقم الجرد</label><input name="number" required value="SC-${Date.now()}" /></div>
        <div><label>المستودع</label>
          <select name="warehouseId" required>
            <option value="">اختر المستودع</option>
            ${warehouses.map((warehouse) => `<option value="${warehouse.id}">${escapeHtml(warehouse.code)} - ${escapeHtml(warehouse.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>التاريخ</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>ملاحظات</label><input name="notes" /></div>
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ الجرد</button></div>
      </form>
    </div>
    <div class="card">
      <h3>إضافة بنود جرد</h3>
      <form id="count-line-form" class="grid cols-2">
        <div><label>الجرد</label>
          <select name="stockCountId" required>
            <option value="">اختر الجرد</option>
            ${counts.map((count) => `<option value="${count.id}">${escapeHtml(count.number)}</option>`).join('')}
          </select>
        </div>
        <div><label>الصنف</label>
          <select name="itemId" required>
            <option value="">اختر الصنف</option>
            ${items.map((item) => `<option value="${item.id}">${escapeHtml(item.code)} - ${escapeHtml(item.nameAr)}</option>`).join('')}
          </select>
        </div>
        <div><label>الكمية النظرية</label><input name="theoreticalQty" type="number" step="0.01" value="0" /></div>
        <div><label>الكمية الفعلية</label><input name="actualQty" type="number" step="0.01" value="0" /></div>
        <div><label>تكلفة الوحدة</label><input name="unitCost" type="number" step="0.01" value="0" /></div>
        <div style="grid-column:1/-1;"><button class="btn btn-secondary" type="submit">إضافة بند</button></div>
      </form>
    </div>
    <div class="card">
      ${table(
        ['رقم الجرد', 'المستودع', 'التاريخ', 'الحالة', 'إجراءات'],
        counts.map((count) => [
          count.number,
          warehouseNames.get(count.warehouseId) || count.warehouseId || '-',
          formatDate(count.date),
          statusBadge(count.status),
          count.status === 'DRAFT' ? `<button class="btn btn-success btn-sm" data-approve="${count.id}">اعتماد</button>` : '-'
        ])
      )}
    </div>
  `;

  document.getElementById('count-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      number: form.number.value,
      warehouseId: Number(form.warehouseId.value),
      date: new Date(form.date.value).toISOString(),
      status: 'DRAFT',
      notes: form.notes.value || undefined
    };
    await withToast(() => api('/stock-counts', 'POST', payload), 'تم إنشاء الجرد');
    await renderStockCounts();
  });

  document.getElementById('count-line-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      stockCountId: Number(form.stockCountId.value),
      itemId: Number(form.itemId.value),
      theoreticalQty: Number(form.theoreticalQty.value || 0),
      actualQty: Number(form.actualQty.value || 0),
      differenceQty: Number(form.actualQty.value || 0) - Number(form.theoreticalQty.value || 0),
      unitCost: Number(form.unitCost.value || 0),
      differenceValue: (Number(form.actualQty.value || 0) - Number(form.theoreticalQty.value || 0)) * Number(form.unitCost.value || 0)
    };
    await withToast(() => api('/stock-count-lines', 'POST', payload), 'تمت إضافة بند الجرد');
    await renderStockCounts();
  });

  view.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`/stock-counts/${button.getAttribute('data-approve')}/approve`, 'POST'), 'تم اعتماد الجرد');
      await renderStockCounts();
    });
  });
}

export async function renderStockMovements() {
  setTitle('حركات المخزون');
  setPageActions({});
  const view = document.getElementById('view');

  const [movementsRes, itemsRes, warehousesRes] = await Promise.all([api('/stock-movements?page=1&limit=500'), api('/items'), api('/warehouses')]);
  const rows = extractRows(movementsRes);
  const items = extractRows(itemsRes);
  const warehouses = extractRows(warehousesRes);
  const itemNames = new Map(items.map((item) => [item.id, `${item.code} - ${item.nameAr}`]));
  const warehouseNames = new Map(warehouses.map((warehouse) => [warehouse.id, `${warehouse.code} - ${warehouse.nameAr}`]));

  view.innerHTML = `
    <div class="card">
      ${table(
        ['النوع', 'المرجع', 'التاريخ', 'الصنف', 'المستودع', 'الكمية', 'تكلفة الوحدة', 'إجمالي التكلفة'],
        rows.map((row) => [
          row.type || '-',
          row.reference || '-',
          formatDate(row.date),
          itemNames.get(row.itemId) || row.itemId || '-',
          warehouseNames.get(row.warehouseId) || row.warehouseId || '-',
          Number(row.quantity || 0),
          formatMoney(row.unitCost || 0),
          formatMoney(row.totalCost || 0)
        ])
      )}
    </div>
  `;
}
