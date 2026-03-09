## Project Instructions

### Preferred local skill

Use `$erp-qween-development` for any task in this repository that touches:

- `apps/*`
- `packages/*`
- `src/modules/*`
- `prisma/*`
- `tests/integration/*`
- `docs/restructure/*`

The skill lives at:

- `.codex/skills/erp-qween-development/SKILL.md`

Use `$push-update-summary` for any task in this repository that involves:

- `git push`
- creating or updating pull requests
- writing progress comments or handoff updates
- summarizing the development work, improvements, verification, or remaining notes

The skill lives at:

- `.codex/skills/push-update-summary/SKILL.md`

### Required workflow

1. Establish the owning system from `packages/app-config/src/index.ts`.
2. Keep frontend changes inside the owning app under `apps/<system>`.
3. Keep backend changes inside the owning module under `src/modules/<owner>`.
4. Keep the shared database model aligned with `docs/restructure/shared-database-ownership.ar.md`.
5. Run the modular guardrail script before handoff:
   `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
6. Run the smallest relevant verification set:
   `npm run lint`
   targeted `tests/integration/*`
   `tests/integration/workspace-frontends.test.ts` for portal or app mount changes

### Hard constraints

- Do not import implementation code from `apps/web` into other apps or packages.
- Do not add new business features to `apps/web`; treat it as a transition-only workspace.
- Do not reintroduce `@erp-qween/legacy-ops-runtime`.
- Do not duplicate ownership of entities across systems.
- Update `docs/restructure/*` when architecture, ownership, routing, or cutover status changes.
- Do not finish a push, PR, or status-comment task without including a concise description of the implemented development and improvements.
