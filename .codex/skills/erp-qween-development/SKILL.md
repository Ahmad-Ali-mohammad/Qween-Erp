---
name: erp-qween-development
description: "Develop, refactor, and extend ERP Qween using the repository's approved architecture: frontend multi-app workspaces under apps/*, shared packages under packages/*, modular-monolith backend under src/modules/*, and one shared PostgreSQL database. Use for any task in this repo that touches system apps, backend modules, Prisma schema or migrations, shared packages, integration tests, central portal navigation, or restructure documentation."
---

# ERP Qween Development

## Overview

Use this skill when working inside the ERP Qween repository. Keep changes aligned with the current target model:

- Frontend: independent system apps in `apps/*`
- Shared frontend code: `packages/*`
- Backend: modular monolith in `src/modules/*`
- Shared database: one PostgreSQL schema with documented ownership
- Architecture docs: `docs/restructure/*`

Read references only when needed:

- Read `references/sources-of-truth.md` before structural work, new systems, routing changes, or documentation updates.
- Read `references/delivery-checklist.md` before implementation or final verification.

Run `scripts/check_modular_guardrails.py` after structural changes and before final handoff.

## Workflow

### 1. Establish the affected system boundary

Start from the source of truth:

- Frontend systems and routing: `packages/app-config/src/index.ts`
- Backend mounting: `src/routes/index.ts`
- System documentation: `docs/restructure/systems/<system>.ar.md`
- Master restructure docs: `docs/restructure/*.ar.md`

Decide which system owns the change before editing files. Do not duplicate ownership across systems.

### 2. Preserve the approved architecture

Apply these rules:

- Put each system UI inside `apps/<system>/src/*`.
- Put reusable UI, auth, API, config, i18n, and domain types in `packages/*`.
- Put backend business logic in the owning module under `src/modules/<owner>/*`.
- Keep `/api/v1/*` as the main API surface. Preserve compatibility aliases only when needed.
- Keep PostgreSQL shared. Do not create parallel schemas or duplicate entities for the same owner.

Avoid these regressions:

- Do not import implementation code from `apps/web` into other apps or packages.
- Do not reintroduce `@erp-qween/legacy-ops-runtime`.
- Do not add cross-app imports between `apps/<system>` directories.
- Do not bypass shared packages for auth, config, or API access.

### 3. Implement by layer

When a feature spans layers, change them in this order:

1. Domain and persistence: Prisma schema, migrations, owning module services
2. API contract and routing: DTOs, routes, response envelope, permissions
3. Frontend app: `Dashboard`, `List`, `Details`, `Reports`, `Settings` as needed
4. Shared packages only if reuse is justified across systems
5. Integration tests and restructure docs

For database work:

- Keep money and totals aligned with project conventions.
- Prefer explicit relational fields over generic JSON blobs for core entities.
- Update migrations instead of relying on ad hoc `db push`.

For frontend work:

- Keep each app independently buildable.
- Prefer system-local UI composition and shared package reuse over global coupling.
- If visual primitives are reused, move them to `packages/ui`.

### 4. Verify the right scope

At minimum, run the relevant subset:

- `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
- `npm run lint`
- `npm run build:apps` when work touches app structure or shared packages
- Targeted integration tests in `tests/integration/*`
- `tests/integration/workspace-frontends.test.ts` for portal and system mount changes

If migrations or backend routing changed, run the relevant integration suite that exercises the affected flow.

### 5. Update documentation when structure changes

Update the affected docs when any of these change:

- System ownership
- New routes or route bases
- New app or shared package responsibilities
- Cutover state
- Shared database ownership

Keep documentation in Arabic unless the content is a code identifier or technical literal.

## Required guardrails

Before finalizing a structural change, confirm all of the following:

- Every listed system in `SYSTEM_APPS` has a matching app directory.
- Every system app has its own entrypoint and main app component.
- Every system has a matching file in `docs/restructure/systems/`.
- No non-legacy app imports from `apps/web`.
- No code references `@erp-qween/legacy-ops-runtime`.

The bundled guardrail script checks these conditions.

## Deliverables standard

A complete change in this repo usually includes:

- Code in the owning backend module
- API route or DTO updates when behavior changes
- Frontend app update in the owning system app
- Integration test coverage for the workflow
- Documentation update in `docs/restructure` when architecture or ownership changes

Do not consider multi-system work complete if only one layer was changed.
