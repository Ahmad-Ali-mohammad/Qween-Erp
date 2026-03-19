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
import { renderDashboard } from '../insight/dashboard.js';
import { renderInvoices } from '../flows/commercial/invoices.js';
import { renderPayments } from '../flows/commercial/payments.js';
import { renderQuotes } from '../flows/commercial/quotes.js';
import { renderAccountStatement, renderGeneralLedger, renderYearClose } from '../flows/finance/reporting.js';

const protectedRoutes = [
  ['/dashboard', renderDashboard],
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
  ['/general-ledger', renderGeneralLedger],
  ['/account-statement', renderAccountStatement],
  ['/year-close', renderYearClose],
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
  ['/leave-requests', () => renderOperations('leave-requests')],
  ['/payroll-runs', () => renderOperations('payroll-runs')],
  ['/contracts', () => renderOperations('contracts')],
  ['/contract-milestones', () => renderOperations('contract-milestones')],
  ['/knowledge-base', () => renderHelp('knowledge')],
  ['/assistant', () => renderHelp('assistant')],
  ['/support', () => renderHelp('support')],
  ['/onboarding', () => renderHelp('onboarding')],
  ['/profile', () => renderProfile('profile')],
  ['/profile-password', () => renderProfile('password')],
  ['/profile-mfa', () => renderProfile('mfa')],
  ['/profile-preferences', () => renderProfile('preferences')]
];

export function registerProtectedRoutes(protect) {
  protectedRoutes.forEach(([path, renderer]) => {
    registerRoute(path, protect(renderer));
  });
}
