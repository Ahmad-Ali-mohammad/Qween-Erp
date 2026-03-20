# Implementation Plan: Integrated ERP Workflow Audit And Modernization

**Branch**: `codex/001-integrated-erp-workflows` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-integrated-erp-workflows/spec.md`

## Summary

Stabilize the current ERP Qween baseline first by fixing failed migrations,
dashboard failures, and broken primary workflows. Then replace the duplicated
shell and workspace configuration with registry-driven contracts, complete the
main operator journeys for all twenty systems, and add governed workspace
customization through layered presets and saved views.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.x for the backend, plus
browser JavaScript modules in `frontend/js/`  
**Primary Dependencies**: Express 4, Prisma 5, Zod, Jest, Supertest, TSX, the
existing browser shell/workspace modules  
**Storage**: PostgreSQL via Prisma  
**Testing**: `npm test` with Jest + Supertest, `npm run lint`,
`npm run check:encoding`, and browser smoke validation for shell/workspace
flows  
**Target Platform**: On-prem web application with an Express API and browser
client supporting desktop and mobile layouts  
**Project Type**: Monolithic web application  
**Performance Goals**: System landing workspaces remain usable when one widget
fails, primary actions are reachable in three navigation steps or fewer, and
critical seeded-environment dashboard data loads within a single render cycle  
**Constraints**: Preserve server-side business invariants, keep all work inside
the existing `src/` and `frontend/` application structure, use forward-only
schema evolution, maintain readable Arabic UI text, and roll out changes across
twenty existing systems without breaking compatibility  
**Scale/Scope**: 20 registered systems, shared shell/navigation, 50+ route
surfaces, multiple business domains, and governed presets scoped to user, role,
or company

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Business Integrity First**: This initiative affects finance, procurement,
  inventory, projects, HR, maintenance, quality, risk, scheduling, contracts,
  and approval-driven control-center views. Validation remains server-side in
  `src/modules/**/service.ts` and route handlers. Existing posting, reversal,
  cancellation, immutable-status, and permission rules remain authoritative.
  Workflow completion fixes must return explicit business errors and preserve
  committed results when downstream refreshes fail.
- **Namespace-First Contracts**: The plan touches backend contracts in
  `src/contracts/`, dashboard and module routes in `src/modules/**/route.ts`,
  shared route forwarding in `src/modules/shared/route-forward.ts`, permission
  constants in `src/constants/permissions.ts`, shell/workspace definitions in
  `frontend/js/shell/*.js`, and system registry definitions in
  `frontend/js/systems/registry.js`. Contract artifacts created in this plan
  formalize the workspace registry, dashboard payloads, and personalization
  inputs before broader frontend changes.
- **Test-Gated Change Sets**: Required coverage includes dashboard integration
  tests, route/workflow integration tests for currently failing systems,
  registry parity tests, frontend smoke checks for key workspaces, and encoding
  validation for Arabic text changes. The current failing suites from the 2026-
  03-20 baseline are part of the acceptance gate for implementation waves.
- **Safe Schema Evolution**: Existing migrations for maintenance, risk, and
  scheduling must be applied and verified before further workflow claims are
  accepted. Personalization entities may require future Prisma additions for
  presets and saved views; those must ship with forward-only migrations, seed
  adjustments, and documented runtime impact. No destructive rename or hidden
  backfill is allowed.
- **Observable and Operable Delivery**: Dashboard resilience, audit logs,
  outbox/event side effects, operator-facing error messages, API documentation,
  and workflow runbook impacts must be updated as work progresses. System audit
  output and workspace fallback states are part of the operational surface.

## Project Structure

### Documentation (this feature)

```text
specs/001-integrated-erp-workflows/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dashboard-payloads.md
│   ├── personalization.md
│   └── system-workspace-registry.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── config/
├── constants/
├── contracts/
├── modules/
├── platform/
├── routes/
└── server.ts

frontend/
├── js/
│   ├── shell/
│   ├── systems/
│   └── modules/
└── styles/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/
├── integration/
├── unit/
└── setup/

docs/
runbooks/
API_ENDPOINTS.md
README.md
```

**Structure Decision**: Extend the current Express + Prisma backend and the
active browser shell instead of introducing new services or a new frontend
framework. Keep feature planning assets under `specs/001-integrated-erp-workflows/`
and production contracts in the existing `src/contracts/` plus documented
spec-level contracts.

## Implementation Phases

### Phase 0 - Baseline Stabilization

1. Apply and verify outstanding Prisma migrations and seed requirements so the
   current schema matches the models used by the failing workflow suites.
2. Repair the failing control-center and system dashboard endpoints so a single
   dashboard failure no longer blocks the system landing experience.
3. Re-run the integration baseline and classify all twenty systems as working,
   partially working, or broken with evidence captured for each.

### Phase 1 - Registry And Contract Normalization

1. Consolidate duplicated route/workspace metadata into a canonical system and
   workspace registry that drives shell navigation, quick actions, and system
   entry states.
2. Define dashboard payload envelopes and independent widget fallback behavior
   so workspaces stay usable under partial failure.
3. Normalize human-readable labels and cross-module reference display rules to
   reduce opaque IDs and inconsistent labels in user-facing lists.

### Phase 2 - Workflow Completion By Domain

1. Fix validation and persistence gaps in budgeting, quality, maintenance,
   risk, scheduling, projects, inventory, procurement, and HR flows first,
   because they currently produce `500`, missing-table, or `422` failures.
2. Ensure successful actions appear in lists, summaries, queues, and dependent
   workspaces without manual intervention.
3. Add regression coverage for the repaired primary journeys and the affected
   approval or immutable-state rules.

### Phase 3 - Governed Customization

1. Introduce personalization concepts for workspace presets, saved views,
   default filters, and role-aware quick actions.
2. Apply layered defaults with governance precedence so customization never
   bypasses permissions, mandatory review steps, or business controls.
3. Provide operator documentation for creating, applying, and troubleshooting
   presets.

### Phase 4 - Hardening And Rollout

1. Re-run API, integration, and browser smoke checks against the target set of
   systems.
2. Update `API_ENDPOINTS.md`, architecture notes, and runbooks for the new
   workspace and dashboard behavior.
3. Prepare the initiative for `/speckit.tasks` by mapping the phases above into
   independently testable slices.

## Risk Focus

- Outstanding local migrations and seed drift can mask whether a failing system
  is broken by schema state or by business logic.
- The current shell uses duplicated configuration in multiple frontend files,
  creating a high risk of partial fixes that regress another navigation path.
- Dashboard resilience work must not hide legitimate business failures; widget
  fallback must separate unavailable telemetry from failed business actions.
- Personalization adds scope creep unless presets remain declarative, layered,
  and subordinate to permissions and invariants.

## Complexity Tracking

No constitution violations are required for this plan.
