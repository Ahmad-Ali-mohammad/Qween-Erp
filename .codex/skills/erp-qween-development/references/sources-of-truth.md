# Sources Of Truth

Use these files as the authoritative map before changing structure or ownership.

## Frontend systems

- `packages/app-config/src/index.ts`
  - system keys
  - route bases
  - app directories
  - API bases
  - grouping and status

## Transitional frontend

- `apps/web`
  - legacy transition workspace only
  - not the official runtime entrypoint
  - do not add new business features here
  - only allow redirect, read-only fallback, or cutover support changes

## Backend routing

- `src/routes/index.ts`
  - mounted `/api/v1/*` routes
  - central APIs
  - compatibility mounts

## Restructure documents

- `docs/restructure/erp-modularization-master-plan.ar.md`
- `docs/restructure/system-catalog.ar.md`
- `docs/restructure/frontend-monorepo-map.ar.md`
- `docs/restructure/backend-domain-map.ar.md`
- `docs/restructure/shared-database-ownership.ar.md`
- `docs/restructure/cutover-plan.ar.md`

## System-specific docs

- `docs/restructure/systems/<system>.ar.md`

Use these files to determine:

- which system owns an entity
- which app should receive a UI change
- which backend module should receive a service or route change
- whether a cutover or fallback path is still intentional

## Shared code boundaries

- `packages/ui`
- `packages/api-client`
- `packages/auth-client`
- `packages/app-config`
- `packages/i18n`
- `packages/domain-types`

If a concern is reusable across multiple systems, place it in one of these packages or create a new shared package only when there is repeated, real reuse.
