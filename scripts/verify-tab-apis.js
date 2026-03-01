/* eslint-disable no-console */
require('ts-node/register/transpile-only');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../src/app');

const appJsPath = path.join(process.cwd(), 'frontend/js/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const pathMatches = [...appJs.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
const tabs = [...new Set(pathMatches)];

const uiOnlyTabs = new Set([
  '/login',
  '/help',
  '/knowledge-base',
  '/assistant',
  '/support',
  '/onboarding',
  '/profile',
  '/profile-password',
  '/profile-mfa',
  '/profile-preferences'
]);

function op(method, apiPath) {
  return { method, apiPath };
}

function resolveOps(tab) {
  if (uiOnlyTabs.has(tab)) {
    return { readOps: [], writeOps: [], mode: 'UI_ONLY' };
  }

  const explicit = {
    '/dashboard': { readOps: [op('get', '/api/reports/kpis')], writeOps: [] },
    '/quick-journal': {
      readOps: [op('get', '/api/accounts'), op('get', '/api/periods'), op('get', '/api/journals')],
      writeOps: [op('post', '/api/journals')]
    },
    '/quick-invoice': {
      readOps: [op('get', '/api/invoices'), op('get', '/api/customers'), op('get', '/api/suppliers')],
      writeOps: [op('post', '/api/invoices')]
    },
    '/quick-statement': { readOps: [op('get', '/api/reports/account-statement?accountId=1&dateFrom=2025-01-01&dateTo=2025-12-31')], writeOps: [] },
    '/global-search': {
      readOps: [op('get', '/api/journals'), op('get', '/api/invoices'), op('get', '/api/payments'), op('get', '/api/customers'), op('get', '/api/suppliers'), op('get', '/api/accounts')],
      writeOps: []
    },
    '/sales-invoices': { readOps: [op('get', '/api/invoices')], writeOps: [op('post', '/api/invoices')] },
    '/purchase-invoices': { readOps: [op('get', '/api/invoices')], writeOps: [op('post', '/api/invoices')] },
    '/receipts': { readOps: [op('get', '/api/payments')], writeOps: [op('post', '/api/payments')] },
    '/payment-vouchers': { readOps: [op('get', '/api/payments')], writeOps: [op('post', '/api/payments')] },
    '/sales-quotes': { readOps: [op('get', '/api/quotes')], writeOps: [op('post', '/api/quotes')] },
    '/sales-reports': { readOps: [op('get', '/api/reports/sales')], writeOps: [] },
    '/purchase-reports': { readOps: [op('get', '/api/reports/purchases')], writeOps: [] },
    '/inventory-reports': { readOps: [op('get', '/api/reports/inventory')], writeOps: [] },
    '/general-ledger': { readOps: [op('get', '/api/journals'), op('get', '/api/accounts')], writeOps: [op('post', '/api/journals')] },
    '/account-statement': { readOps: [op('get', '/api/reports/account-statement?accountId=1&dateFrom=2025-01-01&dateTo=2025-12-31')], writeOps: [] },
    '/year-close': {
      readOps: [op('get', '/api/year-close/check')],
      writeOps: [op('post', '/api/year-close/transfer-balances'), op('post', '/api/year-close/opening-entry')]
    },
    '/depreciation': { readOps: [op('get', '/api/depreciation')], writeOps: [op('post', '/api/depreciation/run')] },
    '/asset-disposal': { readOps: [op('get', '/api/assets')], writeOps: [op('post', '/api/assets')] },
    '/reconciliation': { readOps: [op('get', '/api/bank-transactions')], writeOps: [op('post', '/api/bank-transactions/1/reconcile')] },
    '/budget-variance': { readOps: [op('get', '/api/budgets/lines/all')], writeOps: [op('post', '/api/budgets/lines')] },
    '/asset-reports': { readOps: [op('get', '/api/assets')], writeOps: [] },
    '/cashbox': { readOps: [op('get', '/api/payments')], writeOps: [op('post', '/api/payments')] },
    '/cash-transactions': { readOps: [op('get', '/api/payments')], writeOps: [op('post', '/api/payments')] },
    '/bank-reports': { readOps: [op('get', '/api/bank-transactions')], writeOps: [] },
    '/budget-lines': { readOps: [op('get', '/api/budgets/lines/all')], writeOps: [op('post', '/api/budgets/lines')] },
    '/budget-reports': { readOps: [op('get', '/api/budgets/lines/all')], writeOps: [] },
    '/tax-categories': { readOps: [op('get', '/api/tax-categories')], writeOps: [op('put', '/api/tax-categories')] },
    '/tax-reports': { readOps: [op('get', '/api/tax-reports')], writeOps: [] },
    '/zatca': { readOps: [op('get', '/api/zatca')], writeOps: [op('put', '/api/zatca')] },
    '/currency-diff': { readOps: [op('get', '/api/currency-diff')], writeOps: [op('put', '/api/currency-diff')] },
    '/reports/kpis': { readOps: [op('get', '/api/reports/kpis')], writeOps: [] },
    '/reports/aging': { readOps: [op('get', '/api/reports/aging')], writeOps: [] },
    '/reports/cash-flow': { readOps: [op('get', '/api/reports/cash-flow')], writeOps: [] },
    '/reports/income-comparative': { readOps: [op('get', '/api/reports/income-comparative')], writeOps: [] },
    '/reports/custom': { readOps: [op('get', '/api/reports/custom')], writeOps: [op('post', '/api/reports/custom')] },
    '/reports/schedules': { readOps: [op('get', '/api/reports/schedules')], writeOps: [op('post', '/api/reports/schedules')] },
    '/analytics/forecast': { readOps: [op('get', '/api/analytics/sales-forecast')], writeOps: [] },
    '/users-roles': { readOps: [op('get', '/api/users'), op('get', '/api/roles')], writeOps: [op('post', '/api/users'), op('post', '/api/roles')] },
    '/company-settings': { readOps: [op('get', '/api/settings/company')], writeOps: [op('put', '/api/settings/company')] },
    '/system-settings': { readOps: [op('get', '/api/settings/system')], writeOps: [op('put', '/api/settings/system')] },
    '/internal-controls': { readOps: [op('get', '/api/internal-controls')], writeOps: [op('put', '/api/internal-controls')] },
    '/security': { readOps: [op('get', '/api/security/policies')], writeOps: [op('put', '/api/security/policies')] },
    '/audit-logs': { readOps: [op('get', '/api/audit-logs')], writeOps: [] },
    '/integrations': { readOps: [op('get', '/api/integration-settings')], writeOps: [op('post', '/api/integration-settings')] },
    '/contacts': { readOps: [op('get', '/api/contacts')], writeOps: [op('post', '/api/contacts')] },
    '/leave-requests': { readOps: [op('get', '/api/leaves')], writeOps: [op('post', '/api/leaves')] }
  };

  if (explicit[tab]) return { ...explicit[tab], mode: explicit[tab].mode || 'MAPPED' };

  if (tab.startsWith('/reports/')) {
    return { readOps: [op('get', `/api${tab}`)], writeOps: [], mode: 'MAPPED' };
  }

  if (tab.startsWith('/analytics/')) {
    return { readOps: [op('get', `/api${tab}`)], writeOps: [], mode: 'MAPPED' };
  }

  // default mapping for standard CRUD-like tabs
  return { readOps: [op('get', `/api${tab}`)], writeOps: [op('post', `/api${tab}`)], mode: 'MAPPED' };
}

async function callOp(token, { method, apiPath }) {
  let req = request(app)[method](apiPath).set('Authorization', `Bearer ${token}`);
  if (method === 'post' || method === 'put' || method === 'patch') {
    req = req.send({});
  }
  const res = await req;
  return { status: res.status, exists: res.status !== 404 };
}

(async () => {
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  if (loginRes.status !== 200 || !loginRes.body?.data?.token) {
    console.error('Failed to login as admin. Ensure seed/admin exists.');
    process.exit(1);
  }
  const token = loginRes.body.data.token;

  const results = [];
  for (const tab of tabs) {
    const { readOps, writeOps, mode } = resolveOps(tab);

    if (mode === 'UI_ONLY' || mode === 'MISSING_SPEC') {
      results.push({ tab, mode, get: mode === 'UI_ONLY' ? 'N/A' : 'MISSING', set: mode === 'UI_ONLY' ? 'N/A' : 'MISSING', details: [] });
      continue;
    }

    const readChecks = [];
    for (const opx of readOps) {
      readChecks.push({ ...opx, ...(await callOp(token, opx)) });
    }

    const writeChecks = [];
    for (const opx of writeOps) {
      writeChecks.push({ ...opx, ...(await callOp(token, opx)) });
    }

    const getOk = readChecks.length === 0 ? 'N/A' : readChecks.every((x) => x.exists) ? 'OK' : 'MISSING';
    const setOk = writeChecks.length === 0 ? 'READ_ONLY' : writeChecks.every((x) => x.exists) ? 'OK' : 'MISSING';

    results.push({ tab, mode, get: getOk, set: setOk, details: [...readChecks, ...writeChecks] });
  }

  const missing = results.filter((r) => r.get === 'MISSING' || r.set === 'MISSING' || r.mode === 'MISSING_SPEC');
  const ok = results.filter((r) => r.get === 'OK' && (r.set === 'OK' || r.set === 'READ_ONLY'));

  console.log('=== Tab API Audit Summary ===');
  console.log(`Total tabs: ${results.length}`);
  console.log(`OK tabs: ${ok.length}`);
  console.log(`Missing tabs: ${missing.length}`);

  console.log('\n=== Missing/Needs Spec ===');
  for (const row of missing) {
    console.log(`- ${row.tab} | GET=${row.get} | SET=${row.set} | mode=${row.mode}`);
    for (const d of row.details || []) {
      console.log(`  * ${d.method.toUpperCase()} ${d.apiPath} -> ${d.status}`);
    }
  }

  const reportPath = path.join(process.cwd(), 'runbooks', 'tab-api-audit.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
  console.log(`\nSaved full report: ${reportPath}`);
})();
