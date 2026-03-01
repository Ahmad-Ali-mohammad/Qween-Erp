# API Endpoints (Implemented)

Base URL: `/api`

## Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Users
- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`

## Roles
- `GET /roles`
- `POST /roles`
- `PUT /roles/:id`
- `DELETE /roles/:id`

## Settings
- `GET /settings/company`
- `PUT /settings/company`
- `GET /settings/system`
- `PUT /settings/system`

## Fiscal Years / Periods
- `GET /fiscal-years`
- `GET /fiscal-years/:id`
- `POST /fiscal-years`
- `PUT /fiscal-years/:id`
- `DELETE /fiscal-years/:id`
- `POST /fiscal-years/:id/set-current`

- `GET /periods`
- `GET /periods/:id`
- `POST /periods`
- `PUT /periods/:id`
- `DELETE /periods/:id`
- `POST /periods/:id/close`
- `POST /periods/:id/open`

## Accounts (Advanced Tree)
- `GET /accounts`
- `GET /accounts/:id`
- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`
- `GET /accounts/tree`
- `GET /accounts/tree/with-balances?includeInactive=true&fiscalYear=YYYY&period=N`
- `GET /accounts/:id/balances?fiscalYear=YYYY&period=N`
- `GET /accounts/:id/subtree?fiscalYear=YYYY&period=N`
- `POST /accounts/:id/move`
- `POST /accounts/:id/toggle-posting`
- `POST /accounts/rebuild-levels`

## Journals
- `GET /journals`
- `GET /journals/:id`
- `POST /journals`
- `PUT /journals/:id` (draft only)
- `POST /journals/:id/post`
- `POST /journals/:id/reverse`
- `POST /journals/:id/void`
- `DELETE /journals/:id` (draft only)

## Parties
- `GET /customers`
- `POST /customers`
- `GET /customers/:id`
- `PUT /customers/:id`
- `DELETE /customers/:id`

- `GET /suppliers`
- `POST /suppliers`
- `GET /suppliers/:id`
- `PUT /suppliers/:id`
- `DELETE /suppliers/:id`

- `GET /contacts`
- `POST /contacts`
- `PUT /contacts/:id`
- `DELETE /contacts/:id`

## Invoices
- `GET /invoices`
- `GET /invoices/:id`
- `POST /invoices`
- `PUT /invoices/:id` (draft only)
- `DELETE /invoices/:id` (draft only)
- `POST /invoices/:id/issue`
- `POST /invoices/:id/cancel`

## Payments
- `GET /payments`
- `GET /payments/:id`
- `POST /payments`
- `PUT /payments/:id` (pending only)
- `DELETE /payments/:id` (pending only)
- `POST /payments/:id/complete`
- `POST /payments/:id/cancel`

## Banks
- `GET /banks`
- `POST /banks`
- `GET /banks/:id`
- `PUT /banks/:id`
- `DELETE /banks/:id`

## Bank Transactions
- `GET /bank-transactions`
- `GET /bank-transactions/:id`
- `POST /bank-transactions`
- `PUT /bank-transactions/:id`
- `DELETE /bank-transactions/:id`
- `POST /bank-transactions/:id/reconcile`

## Assets
- `GET /assets`
- `POST /assets`
- `GET /assets/:id`
- `PUT /assets/:id`
- `DELETE /assets/:id` (soft/archive if depreciation exists)
- `POST /assets/:id/dispose`

## Asset Categories
- `GET /asset-categories`
- `GET /asset-categories/:id`
- `POST /asset-categories`
- `PUT /asset-categories/:id`
- `DELETE /asset-categories/:id`

## Depreciation
- `GET /depreciation`
- `POST /depreciation/run`

## Budgets
- `GET /budgets`
- `GET /budgets/:id`
- `POST /budgets`
- `PUT /budgets/:id`
- `DELETE /budgets/:id`
- `GET /budgets/lines/all`
- `POST /budgets/lines`
- `PUT /budgets/lines/:id`
- `DELETE /budgets/lines/:id`

## Tax Codes
- `GET /tax-codes`
- `GET /tax-codes/:id`
- `POST /tax-codes`
- `PUT /tax-codes/:id`
- `DELETE /tax-codes/:id`

## Tax Declarations
- `GET /tax-declarations`
- `GET /tax-declarations/:id`
- `POST /tax-declarations`
- `PUT /tax-declarations/:id`
- `DELETE /tax-declarations/:id`

## Reports
- `GET /reports/trial-balance`
- `GET /reports/income-statement?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- `GET /reports/balance-sheet?asOfDate=YYYY-MM-DD`
- `GET /reports/account-statement?accountId=ID&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- `GET /reports/kpis`

## Audit Logs
- `GET /audit-logs?page=1&limit=50&table=accounts`

## Expansion (Phase 2+)
- `GET/POST/PUT/DELETE /items`
- `GET/POST/PUT/DELETE /item-categories`
- `GET/POST/PUT/DELETE /units`
- `GET/POST/PUT/DELETE /warehouses`
- `GET/POST/PUT/DELETE /warehouse-locations`
- `GET/POST/PUT/DELETE /stock-movements`
- `GET/POST/PUT/DELETE /stock-counts`
- `GET/POST/PUT/DELETE /sales-quotes`
- `GET/POST/PUT/DELETE /sales-returns`
- `GET/POST/PUT/DELETE /purchase-orders`
- `GET/POST/PUT/DELETE /purchase-order-lines`
- `GET/POST/PUT/DELETE /purchase-receipts`
- `GET/POST/PUT/DELETE /opportunities`
- `GET/POST/PUT/DELETE /support-tickets`
- `GET/POST/PUT/DELETE /support-messages`
- `GET/POST/PUT/DELETE /project-tasks`
- `GET/POST/PUT/DELETE /project-expenses`
- `GET /projects/:id/tasks`
- `POST /projects/:id/tasks`
- `GET /projects/:id/expenses`
- `POST /projects/:id/expenses`
- `GET/POST/PUT/DELETE /employees`
- `GET/POST/PUT/DELETE /leaves`
- `GET/POST/PUT/DELETE /payroll-runs`
- `GET/POST/PUT/DELETE /payroll-lines`
- `GET/POST/PUT/DELETE /contracts`
- `GET /contracts/:id/milestones`
- `POST /contracts/:id/milestones`
- `GET/POST/PUT/DELETE /notifications`
- `GET/POST/PUT/DELETE /tasks`
- `GET/POST/PUT/DELETE /backups`
- `GET /backups/schedules`
- `POST /backups/:id/restore`
- `GET/PUT /integrations/:name`
- `GET/POST/PUT/DELETE /currencies`
- `GET/POST/PUT/DELETE /exchange-rates`
- `GET /security/policies`
- `PUT /security/policies`
- `GET /security/mfa/:userId`
- `PUT /security/mfa/:userId`
- `POST /import/:resource`
- `GET /year-close/check`
- `POST /year-close/transfer-balances`
- `POST /year-close/opening-entry`
- `POST /journals/bulk-post`

## Advanced Reports & Analytics
- `GET /reports/aging`
- `GET /reports/cash-flow`
- `GET /reports/income-comparative`
- `GET/POST /reports/custom`
- `GET/POST /reports/schedules`
- `GET /analytics/abc`
- `GET /analytics/clv`
- `GET /analytics/sales-forecast`
- `GET /analytics/bsc`

## Health
- `GET /health`
