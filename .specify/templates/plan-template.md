# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Business Integrity First**: Identify the financial, inventory, approval,
  payroll, contract, or project invariants this feature can affect. State how
  validation happens server-side and how failures or reversals are handled.
- **Namespace-First Contracts**: List the `src/contracts/**`,
  `src/modules/**/route.ts`, permission constants, and compatibility routes that
  will change. If no public contract changes exist, say so explicitly.
- **Test-Gated Change Sets**: Name the unit/integration/regression coverage that
  must be added or updated. If tests are intentionally omitted, justify why the
  change is low-risk.
- **Safe Schema Evolution**: Describe impact on `prisma/schema.prisma`,
  migrations, seeds, backfills, and existing records, or mark as `N/A`.
- **Observable and Operable Delivery**: Note required audit logging, outbox
  events, health/runbook impacts, and API/documentation updates.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app.ts
├── server.ts
├── config/
├── constants/
├── contracts/
├── middleware/
├── modules/
├── platform/
├── routes/
├── types/
└── utils/

frontend/
├── index.html
├── js/
│   ├── app.js
│   ├── admin/
│   ├── auth/
│   ├── core/
│   ├── flows/
│   ├── i18n/
│   ├── insight/
│   ├── modules/
│   ├── shell/
│   └── systems/
└── styles/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/
├── integration/
├── setup/
└── unit/

docs/
runbooks/
scripts/
API_ENDPOINTS.md
README.md
```

**Structure Decision**: Use the existing Express + Prisma backend under `src/`,
the active browser client under `frontend/`, Prisma assets under `prisma/`, and
repository-level tests/docs rather than introducing new top-level apps.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
