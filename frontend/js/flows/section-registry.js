import { toast } from '../core/ui.js';
import { renderModuleShell } from '../modules/module-shell.js';
import { renderSalesReturns } from './commercial/sales-returns.js';
import { renderPurchaseOrders, renderPurchaseReturns } from './procurement/purchase-flows.js';
import { renderInventoryReportsPage, renderPurchaseReportsPage, renderSalesReportsPage } from '../insight/operational-reports.js';
import { renderItemCategories, renderItems, renderStockCounts, renderStockMovements, renderUnits, renderWarehouses } from './inventory/inventory-admin.js';

const titles = {
  '/sales-returns': 'مرتجعات المبيعات',
  '/sales-reports': 'تقارير المبيعات',
  '/purchase-orders': 'طلبات الشراء',
  '/purchase-returns': 'مرتجعات المشتريات',
  '/purchase-reports': 'تقارير المشتريات',
  '/items': 'الأصناف',
  '/item-categories': 'تصنيفات الأصناف',
  '/units': 'الوحدات',
  '/warehouses': 'المستودعات',
  '/stock-counts': 'جرد المخزون',
  '/stock-movements': 'حركات المخزون',
  '/inventory-reports': 'تقارير المخزون'
};

const sectionHandlers = {
  '/sales-returns': renderSalesReturns,
  '/sales-reports': renderSalesReportsPage,
  '/purchase-orders': renderPurchaseOrders,
  '/purchase-returns': renderPurchaseReturns,
  '/purchase-reports': renderPurchaseReportsPage,
  '/items': renderItems,
  '/item-categories': renderItemCategories,
  '/units': renderUnits,
  '/warehouses': renderWarehouses,
  '/stock-counts': renderStockCounts,
  '/stock-movements': renderStockMovements,
  '/inventory-reports': renderInventoryReportsPage
};

export async function renderSection(path) {
  try {
    const render = sectionHandlers[path];
    if (render) {
      await render();
      return;
    }

    await renderModuleShell({ title: titles[path] ?? 'وحدة' });
  } catch (error) {
    toast(error.message || 'حدث خطأ أثناء تحميل الصفحة', 'error');
  }
}
