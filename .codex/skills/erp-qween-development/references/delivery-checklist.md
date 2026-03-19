# Delivery Checklist

Run this checklist before finishing a task.

## For backend changes

- Edit the owning module under `src/modules/<owner>`.
- Preserve `/api/v1/*` routing conventions.
- Keep response envelopes consistent with the existing API style.
- Update DTOs, permissions, and tests if behavior changed.

## For database changes

- Update Prisma schema and create a migration.
- Keep ownership explicit; do not duplicate an existing entity under a second system.
- Update seeds only if bootstrap data or development flows depend on it.

## For frontend app changes

- Keep the feature inside the owning `apps/<system>` workspace.
- Reuse `packages/*` for shared concerns.
- Do not import from `apps/web` into other apps.
- Do not add `legacy-ops-runtime` back.
- Keep `apps/web` redirect-only; no Redux, no Sentry UI runtime, no PWA, and no new feature pages there.
- Keep `apps/web/src` minimal too: only the transition entry files should remain, without `src/app`, `src/components`, `src/features`, or `src/observability`.
- Keep `frontend/` minimal too: only the legacy landing page and its standalone `frontend/js/app.js`.

## For cross-system changes

- Verify the source system and consumer system boundaries.
- Update the central portal or navigation only when user entrypoints change.
- Add or update integration tests that cover the full workflow, not just one endpoint.

## Commands

Use the smallest relevant set:

- `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
- `npm run lint`
- `npm run build:apps`
- `npx jest tests/integration/workspace-frontends.test.ts --runInBand`
- Targeted `tests/integration/*` suites for the affected domain

## Documentation

Update `docs/restructure/*` when any of these change:

- ownership
- route structure
- cutover state
- new system responsibilities
- shared database boundaries
