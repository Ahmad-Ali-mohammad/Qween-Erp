<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.0.0
- Modified principles:
  - Initial adoption of ERP Qween delivery constitution
- Added sections:
  - Technical Guardrails
  - Delivery Workflow & Quality Gates
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Follow-up TODOs:
  - None
-->

# ERP Qween Constitution

## Core Principles

### I. Business Integrity First
Every change that touches accounting, inventory, contracts, payroll, approvals,
or project execution MUST preserve domain invariants on the server side before
any UI affordance is considered complete. Validation MUST live in the backend,
not only in the frontend, and each irreversible action MUST define its reversal,
audit trail, and failure mode. Features that can affect posted amounts,
quantities, period close status, or contractual commitments MUST describe those
effects explicitly in the spec and plan.

### II. Namespace-First Contracts
New capabilities MUST enter the system through explicit API contracts and
module-owned routes that match the repository structure under `src/modules/`
and `src/contracts/`. Compatibility shims may exist, but they MUST be
intentional, time-bounded, and documented in the plan. Shared DTOs,
permissions, and route behavior MUST be updated before frontend wiring is
considered complete.

### III. Test-Gated Change Sets
Business-critical logic MUST ship with automated verification proportional to
risk. Public API changes, approval/posting flows, regression fixes, Prisma data
model changes, and cross-module orchestration MUST include or update tests in
`tests/unit/` and/or `tests/integration/`. A missing test is acceptable only
for low-risk content/configuration changes and MUST be justified in the plan or
task list.

### IV. Safe Schema Evolution
Database evolution MUST be forward-only, reviewable, and reproducible. Changes
to `prisma/schema.prisma` MUST ship with Prisma migrations, any required seed or
backfill updates, and a clear note describing runtime impact on existing data.
Destructive data changes, silent renames, and hidden behavior shifts are not
allowed without an explicit migration strategy and rollback or mitigation plan.

### V. Observable and Operable Delivery
Operationally meaningful changes MUST leave evidence. Logging, audit metadata,
outbox publishing, health impact, and runbook/API documentation updates MUST be
considered whenever a feature changes system behavior across boundaries.
Failures MUST degrade safely, with actionable diagnostics for operators and
developers.

## Technical Guardrails

- The default backend stack is Node.js + TypeScript + Express + Prisma +
  PostgreSQL, and new server work SHOULD extend the existing layout under
  `src/` rather than creating parallel application stacks.
- The active frontend lives only in `frontend/`; new UI work SHOULD use the
  existing `frontend/js/` and `frontend/styles/` structure instead of adding a
  second frontend framework or duplicate build pipeline.
- Shared interfaces belong in `src/contracts/`, cross-cutting backend behavior
  belongs in `src/modules/shared/` or `src/platform/`, and operational notes
  belong in `docs/`, `runbooks/`, or `API_ENDPOINTS.md`.
- User-facing Arabic text and mixed-language UI updates MUST preserve readable
  encoding and SHOULD pass `npm run check:encoding` whenever frontend text is
  touched.
- Repository sprawl is a defect: prefer extending existing modules and tests
  before adding new top-level folders or isolated subprojects.

## Delivery Workflow & Quality Gates

- Significant product work SHOULD follow the `spec -> plan -> tasks -> implement`
  flow in Spec Kit. Small fixes may skip documents only when the impacted
  modules, data changes, tests, and operational effects remain obvious.
- Each implementation plan MUST name the affected backend modules, contracts,
  frontend workspaces, Prisma files, and documentation touch points. If a
  section is not affected, it MUST say so explicitly.
- Each feature spec that touches money, stock, approvals, or permissions MUST
  state business invariants, actor roles, edge cases, and measurable success
  outcomes.
- Each task list MUST separate foundational work from independently testable
  user-story slices so the team can ship incrementally without breaking core
  flows.
- Changes to routes or externally consumed behavior MUST update the relevant
  API or operator documentation before the work is considered complete.

## Governance

This constitution overrides informal local preferences for architecture,
testing, and delivery standards within this repository. Amendments MUST include
the rationale, the semantic version bump, and any required template or workflow
sync. Reviews and implementation plans MUST check compliance with the five core
principles. Any justified exception MUST be written in the plan's Complexity
Tracking section and resolved or reaffirmed before release.

Versioning policy for this constitution follows semantic versioning:

- MAJOR for breaking governance changes or principle removals/redefinitions
- MINOR for new principles, gates, or materially stronger requirements
- PATCH for clarifications that do not change project obligations

**Version**: 1.0.0 | **Ratified**: 2026-03-20 | **Last Amended**: 2026-03-20
