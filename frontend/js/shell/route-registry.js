import { registerRoute } from '../core/router.js';
import { renderAccounts } from '../modules/accounts.js';
import { renderJournals } from '../modules/journals.js';
import { renderAssets } from '../modules/assets.js';
import { renderReports } from '../insight/reporting.js';
import { renderSettings } from '../admin/settings.js';
import { renderParties } from '../modules/parties.js';
import { renderFiscal } from '../modules/fiscal.js';
import { renderBanks } from '../modules/banks.js';
import { renderBudgets } from '../modules/budgets.js';
import { renderTaxes } from '../modules/taxes.js';
import { renderCurrencies } from '../modules/currencies.js';
import { renderAuditLogs } from '../modules/audit.js';
import { renderHelp } from '../modules/help.js';
import { renderProfile } from '../admin/profile.js';
import { renderOperations } from '../flows/operations/index.js';
import { renderQuickInvoice, renderQuickJournal, renderQuickStatement, renderGlobalSearch } from './quick-actions.js';
import { renderSection } from '../flows/section-registry.js';
import { renderInvoices } from '../flows/commercial/invoices.js';
import { renderPayments } from '../flows/commercial/payments.js';
import { renderQuotes } from '../flows/commercial/quotes.js';
import { renderAccountStatement, renderGeneralLedger, renderYearClose } from '../flows/finance/reporting.js';
import { renderSystemDashboard } from '../systems/dashboard.js';
import { createSystemsRegistry } from '../systems/registry.js';
import { renderPrintingWorkspace } from '../systems/printing.js';
import { renderSiteOpsWorkspace } from '../systems/site-ops.js';
import { renderSubcontractorsWorkspace } from '../systems/subcontractors.js';
import { renderTenderingWorkspace } from '../systems/tendering.js';
import { renderBudgetingWorkspace } from '../systems/budgeting.js';
import { renderQualityWorkspace } from '../systems/quality.js';
import { renderMaintenanceWorkspace } from '../systems/maintenance.js';
import { renderRiskWorkspace } from '../systems/risk.js';
import { renderSchedulingWorkspace } from '../systems/scheduling.js';

const systemsRegistry = createSystemsRegistry((key) => () => renderSystemDashboard(key));

const protectedRoutes = [
  ['/dashboard', () => renderSystemDashboard('control-center')],
  ['/accounts', renderAccounts],
  ['/journals', renderJournals],
  ['/fiscal-years', () => renderFiscal('years')],
  ['/periods', () => renderFiscal('periods')],
  ['/customers', () => renderParties('customers')],
  ['/suppliers', () => renderParties('suppliers')],
  ['/sales-invoices', () => renderInvoices('SALES')],
  ['/purchase-invoices', () => renderInvoices('PURCHASE')],
  ['/receipts', () => renderPayments('RECEIPT')],
  ['/payment-vouchers', () => renderPayments('PAYMENT')],
  ['/asset-categories', () => renderAssets('categories')],
  ['/assets', () => renderAssets('assets')],
  ['/depreciation', () => renderAssets('depreciation')],
  ['/banks', () => renderBanks('banks')],
  ['/bank-transactions', () => renderBanks('transactions')],
  ['/reconciliation', () => renderBanks('reconciliation')],
  ['/budgets', () => renderBudgets('budgets')],
  ['/budget-variance', () => renderBudgets('variance')],
  ['/tax-codes', () => renderTaxes('codes')],
  ['/tax-declarations', () => renderTaxes('declarations')],
  ['/reports/trial-balance', () => renderReports('trial-balance')],
  ['/reports/income-statement', () => renderReports('income-statement')],
  ['/reports/balance-sheet', () => renderReports('balance-sheet')],
  ['/reports/kpis', () => renderReports('kpis')],
  ['/users-roles', () => renderSettings('users-roles')],
  ['/company-settings', () => renderSettings('company')],
  ['/audit-logs', renderAuditLogs],
  ['/help', () => renderHelp('center')],
  ['/quick-journal', renderQuickJournal],
  ['/quick-invoice', renderQuickInvoice],
  ['/quick-statement', renderQuickStatement],
  ['/global-search', renderGlobalSearch],
  ['/approvals', () => renderSystemDashboard('control-center')],
  ['/documents', () => renderSystemDashboard('documents')],
  ['/general-ledger', renderGeneralLedger],
  ['/account-statement', renderAccountStatement],
  ['/supplier-statements', () => renderParties('suppliers')],
  ['/year-close', renderYearClose],
  ['/collections', () => renderPayments('RECEIPT')],
  ['/sales-quotes', renderQuotes],
  ['/sales-returns', () => renderSection('/sales-returns')],
  ['/sales-reports', () => renderSection('/sales-reports')],
  ['/purchase-orders', () => renderSection('/purchase-orders')],
  ['/purchase-returns', () => renderSection('/purchase-returns')],
  ['/purchase-reports', () => renderSection('/purchase-reports')],
  ['/items', () => renderSection('/items')],
  ['/item-categories', () => renderSection('/item-categories')],
  ['/units', () => renderSection('/units')],
  ['/warehouses', () => renderSection('/warehouses')],
  ['/stock-counts', () => renderSection('/stock-counts')],
  ['/stock-movements', () => renderSection('/stock-movements')],
  ['/inventory-reports', () => renderSection('/inventory-reports')],
  ['/inventory-items', () => renderSection('/items')],
  ['/inventory-movements', () => renderSection('/stock-movements')],
  ['/asset-disposal', () => renderAssets('disposal')],
  ['/asset-reports', () => renderAssets('reports')],
  ['/cashbox', () => renderBanks('cashbox')],
  ['/cash-transactions', () => renderBanks('cash-transactions')],
  ['/bank-reports', () => renderBanks('reports')],
  ['/budget-lines', () => renderBudgets('lines')],
  ['/budget-reports', () => renderBudgets('reports')],
  ['/tax-categories', () => renderTaxes('categories')],
  ['/zatca', () => renderTaxes('zatca')],
  ['/tax-reports', () => renderTaxes('reports')],
  ['/currencies', () => renderCurrencies('currencies')],
  ['/exchange-rates', () => renderCurrencies('exchange-rates')],
  ['/currency-diff', () => renderCurrencies('diff')],
  ['/reports/aging', () => renderReports('aging')],
  ['/reports/cash-flow', () => renderReports('cash-flow')],
  ['/reports/income-comparative', () => renderReports('income-comparative')],
  ['/reports/custom', () => renderReports('custom')],
  ['/reports/schedules', () => renderReports('schedules')],
  ['/analytics/abc', () => renderReports('abc')],
  ['/analytics/clv', () => renderReports('clv')],
  ['/analytics/forecast', () => renderReports('forecast')],
  ['/analytics/bsc', () => renderReports('bsc')],
  ['/system-settings', () => renderSettings('system')],
  ['/backups', () => renderSettings('backups')],
  ['/notifications', () => renderSettings('notifications')],
  ['/tasks', () => renderSettings('tasks')],
  ['/audit-log', renderAuditLogs],
  ['/internal-controls', () => renderSettings('internal-controls')],
  ['/security', () => renderSettings('security')],
  ['/integrations', () => renderSettings('integrations')],
  ['/opportunities', () => renderOperations('opportunities')],
  ['/support-tickets', () => renderHelp('tickets')],
  ['/contacts', () => renderOperations('contacts')],
  ['/projects', () => renderOperations('projects')],
  ['/project-tasks', () => renderOperations('project-tasks')],
  ['/project-expenses', () => renderOperations('project-expenses')],
  ['/employees', () => renderOperations('employees')],
  ['/timesheets', () => renderOperations('employees')],
  ['/leave-requests', () => renderOperations('leave-requests')],
  ['/payroll', () => renderOperations('payroll-runs')],
  ['/payroll-runs', () => renderOperations('payroll-runs')],
  ['/contracts', () => renderOperations('contracts')],
  ['/contract-milestones', () => renderOperations('contract-milestones')],
  ['/goods-receipts', () => renderSection('/purchase-orders')],
  ['/supplier-payments', () => renderPayments('PAYMENT')],
  ['/knowledge-base', () => renderHelp('knowledge')],
  ['/assistant', () => renderHelp('assistant')],
  ['/support', () => renderHelp('support')],
  ['/onboarding', () => renderHelp('onboarding')],
  ['/profile', () => renderProfile('profile')],
  ['/profile-password', () => renderProfile('password')],
  ['/profile-mfa', () => renderProfile('mfa')],
  ['/profile-preferences', () => renderProfile('preferences')],
  ['/systems/subcontractors/contracts', () => renderSubcontractorsWorkspace('contracts')],
  ['/systems/subcontractors/payments', () => renderSubcontractorsWorkspace('payments')],
  ['/systems/printing/templates', () => renderPrintingWorkspace('templates')],
  ['/systems/printing/jobs', () => renderPrintingWorkspace('jobs')],
  ['/systems/printing/archive', () => renderPrintingWorkspace('archive')],
  ['/systems/budgeting/scenarios', () => renderBudgetingWorkspace('scenarios')],
  ['/systems/budgeting/variance', () => renderBudgetingWorkspace('variance')],
  ['/systems/budgeting/forecast', () => renderBudgetingWorkspace('forecast')],
  ['/systems/quality/inspections', () => renderQualityWorkspace('inspections')],
  ['/systems/quality/ncr', () => renderQualityWorkspace('ncr')],
  ['/systems/quality/incidents', () => renderQualityWorkspace('incidents')],
  ['/systems/maintenance/plans', () => renderMaintenanceWorkspace('plans')],
  ['/systems/maintenance/orders', () => renderMaintenanceWorkspace('orders')],
  ['/systems/maintenance/failures', () => renderMaintenanceWorkspace('failures')],
  ['/systems/risk/register', () => renderRiskWorkspace('register')],
  ['/systems/risk/heatmap', () => renderRiskWorkspace('heatmap')],
  ['/systems/risk/followup', () => renderRiskWorkspace('followup')],
  ['/systems/scheduling/plans', () => renderSchedulingWorkspace('plans')],
  ['/systems/scheduling/tasks', () => renderSchedulingWorkspace('tasks')],
  ['/systems/scheduling/critical-path', () => renderSchedulingWorkspace('critical-path')],
  ['/systems/site-ops/daily', () => renderSiteOpsWorkspace('daily')],
  ['/systems/site-ops/materials', () => renderSiteOpsWorkspace('materials')],
  ['/systems/site-ops/attendance', () => renderSiteOpsWorkspace('attendance')],
  ['/systems/site-ops/issues', () => renderSiteOpsWorkspace('issues')],
  ['/systems/tendering/tenders', () => renderTenderingWorkspace('tenders')],
  ['/systems/tendering/analysis', () => renderTenderingWorkspace('analysis')]
];

export function registerProtectedRoutes(protect) {
  protectedRoutes.forEach(([path, renderer]) => {
    registerRoute(path, protect(renderer));
  });

  systemsRegistry.forEach((system) => {
    if (system.dashboardRenderer) {
      registerRoute(system.route, protect(system.dashboardRenderer));
    }
  });
}
