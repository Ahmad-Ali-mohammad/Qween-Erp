# Front/Back Integration Plan

## Goal

Refactor the ERP into clearer, cohesive modules without breaking the current API contracts. The immediate target is a cleaner modular monolith:

- Frontend organized by shell, session, workspace navigation, and business flows.
- Backend organized by domain routes instead of large compatibility buckets.
- Stable contracts between quote, invoice, payment, dashboard, and profile modules.

## What Changed Now

### Frontend

- `frontend/`
  - The active frontend root is consolidated in a single folder.
  - Duplicate app folders were removed after the merge.

- `frontend/js/core/runtime.js`
  - Central runtime API base resolution.
  - Supports same-origin `/api` by default and external override later.

- `frontend/js/core/store.js`
  - Real `remember me` behavior.
  - Local persistence for remembered sessions.
  - Session persistence for temporary sessions.
  - Auth change event dispatching for shell sync.

- `frontend/js/auth/login.js`
  - Login flow separated from generic modules.

- `frontend/js/admin/profile.js`
  - Profile, password, MFA, and preferences moved into an admin-facing boundary.

- `frontend/js/admin/settings.js`
  - Company, system, security, controls, integrations, backups, notifications, and tasks moved out of legacy modules.

- `frontend/js/shell/workspace-config.js`
  - Central route permission map.
  - Role-aware navigation sections.
  - Role-aware dashboard profiles.

- `frontend/js/shell/app-shell.js`
  - Sidebar rendering and shell visibility separated from `app.js`.

- `frontend/js/shell/route-registry.js`
  - Protected route registration separated from app bootstrapping.

- `frontend/js/shell/quick-actions.js`
  - Workspace quick actions separated from feature modules.

- `frontend/js/flows/commercial/document-workspace.js`
  - Shared primitives for searchable party lookup and line editor behavior.

- `frontend/js/flows/commercial/quotes.js`
- `frontend/js/flows/commercial/invoices.js`
- `frontend/js/flows/commercial/payments.js`
  - Dedicated business flows instead of mixed UI logic.

- `frontend/js/flows/commercial/sales-returns.js`
- `frontend/js/flows/operations/index.js`
- `frontend/js/flows/operations/shared.js`
- `frontend/js/flows/procurement/purchase-flows.js`
- `frontend/js/flows/inventory/inventory-admin.js`
- `frontend/js/flows/section-registry.js`
  - Legacy section pages and operational workspaces decomposed into commercial, operations, procurement, inventory, and registry layers.

- `frontend/js/flows/finance/reporting.js`
  - General ledger, account statement, and year-close flows extracted from `app.js`.

- `frontend/js/insight/dashboard.js`
  - Dashboard rendering separated into an insight-oriented module.

- `frontend/js/insight/reporting.js`
- `frontend/js/insight/report-utils.js`
  - Reports and analytics moved into the insight layer with shared report helpers.

### Backend

- `src/modules/finance/route.ts`
- `src/modules/crm/route.ts`
- `src/modules/hr/route.ts`
- `src/modules/projects/route.ts`
- `src/modules/procurement/route.ts`
- `src/modules/inventory/route.ts`
  - Legal domain namespaces now exist beside the legacy flat routes.
  - Existing modules stay mounted at old paths while new `/api/finance/*`, `/api/crm/*`, `/api/hr/*`, `/api/projects/*`, `/api/procurement/*`, `/api/inventory/*`, `/api/platform/*`, and `/api/documents/*` aliases own the future integration surface.

- `src/modules/platform/route.ts`
  - Branches, approval workflows, and outbox operations moved into a dedicated platform boundary.

- `src/modules/documents/route.ts`
  - Document metadata and attachment lifecycle now live in a dedicated document module.

- `src/modules/crm/opportunities.service.ts`
  - Opportunity award orchestration now creates approved contracts and execution projects in one transactional boundary.

- `src/modules/hr/timesheets.service.ts`
  - Timesheets are now a first-class HR/projects bridge with approval and payroll-to-project cost distribution.

- `src/platform/events/*`
  - Outbox contracts, enqueue helpers, RabbitMQ publisher, and worker bootstrap added for event-driven integration.

- `src/modules/dashboard/route.ts`
  - Dashboard KPIs, charts, recent activity, pending queues.

- `src/modules/profile/route.ts`
  - Profile, password, MFA, preferences.

- `src/modules/platform-admin/route.ts`
  - Backups, security policies, admin MFA settings, internal controls, permissions, and integrations.

- `src/modules/workspace/route.ts`
  - Notifications and task actions moved out of the compatibility bucket.

- `src/modules/year-close/route.ts`
  - Year-close checks and commands.

- `src/modules/settings/route.ts`
  - Sequence compatibility endpoints now live with system settings.

- `prisma/schema.prisma`
  - Phase 0 shared foundation introduced:
  - `Branch`
  - `ApprovalWorkflow`
  - `Document`
  - `OutboxEvent`
  - `EventConsumption`
  - Key operational documents now carry `branchId`, `approvalStatus`, `postingStatus`, and `attachmentsCount` where relevant.
  - Phase 1 slice aligned the schema and runtime models for:
  - `Project.contractId`
  - `Attendance`
  - `Timesheet`
  - `UserBranchAccess`
  - `PayrollRun.branchId`
  - `PayrollLine.branchId`

## Accounting Assumptions Implemented

1. Accounting basis is `accrual`.
2. Posting into GL remains immutable after posting; issue/complete transitions create journals instead of mutating posted entries.
3. Operational status is separate from posting status:
   - quote uses business status plus `approvalStatus`
   - invoice/payment keep `status` independent from `postingStatus`
4. Initial tax assumption remains VAT-exclusive pricing with line-level tax rates already used by invoice and quote calculations.
5. The first release remains `single legal entity + branches`, not multi-company.
6. RabbitMQ is optional at runtime:
   - when disabled, outbox rows are still created
   - when enabled, the background worker publishes pending rows to the configured exchange

## Target Boundaries

### Frontend target modules

1. `frontend`
   - the only active UI workspace

2. `core`
   - runtime, api, store, auth, router, ui

3. `auth`
   - login
   - session bootstrap

4. `admin`
   - profile
   - password
   - preferences
   - mfa

5. `shell`
   - topbar, sidebar, workspace config, route guards, route registry
   - quick actions

6. `flows`
   - quotes
   - invoices
   - payments
   - finance reporting
   - operations workspace
   - purchase orders
   - returns
   - inventory master data
   - stock control

7. `insight`
   - dashboard
   - reports
   - analytics

### Backend target modules

1. `auth`
   - login, refresh, logout, me

2. `commercial`
   - quotes
   - invoices
   - payments
   - purchase orders
   - returns

3. `insight`
   - dashboard
   - reports
   - analytics

4. `platform`
   - profile
   - workspace notifications/tasks
   - security
   - backups
   - integrations
   - internal controls

5. `close`
   - fiscal checks
   - year close
   - opening balance workflows

## Contract Rules

1. Quote stays operational until converted.
2. Invoice remains `DRAFT` before issue and becomes accounting-relevant only after issue.
3. Payment allocations must be saved before or during completion.
4. Dashboard responses should return display-ready relations when the UI needs names, not just IDs.
5. Session state changes must emit one shell-level update path instead of direct DOM mutation from many files.
6. Core cross-domain orchestration must happen in domain services with outbox events, not in compatibility routes.

## Remaining Extraction Work

1. Move `tax-categories`, `zatca`, and `currency-diff` out of `erp-expansion`.
2. Continue shrinking `api-compat` by moving the remaining report and utility compatibility routes into domain modules.
3. Continue splitting the remaining legacy frontend modules in `frontend/js/modules` by domain after moving `operations`, `settings`, and `reports`.
4. Introduce request/response typing shared between frontend and backend.
5. Move remaining reusable UI helpers from page files into shared flow or shell modules.

## Linking Plan

1. Frontend shell owns navigation, auth state, and route guards only.
2. Frontend business flows call backend domain routes through `frontend/js/core/api.js`.
3. Backend route modules stay thin and delegate business rules to domain services.
4. Shared contracts should be introduced first for quote, invoice, payment, dashboard, and profile responses.
5. Compatibility routes may stay mounted at legacy paths, but ownership must live in the domain module that actually enforces the rule.
6. Any future extracted UI should be migrated into `frontend/js/flows`, `frontend/js/insight`, or `frontend/js/shell`, not revived as a separate app tree.

## Recommended Next Iteration

1. Add `tenders`, `contracts`, `subcontractors`, and `documents` domain services under the same namespace-first pattern instead of extending compatibility buckets.
2. Expand branch isolation from schema support to actual query scoping and role-based branch access.
3. Add event consumers with `EventConsumption` idempotency checks for:
   - claim to invoice draft/issue
   - payroll to project labor cost beyond the current synchronous distribution endpoint
   - purchase receipt to inventory/project cost
4. Move the remaining `tax`, `currency`, and operational compatibility write paths out of `erp-expansion` and `api-compat`.
5. Add frontend smoke tests for the new legal namespaces and the document attachment counters.
