## Summary
- add `/api/v1/org/*` foundation endpoints for branches, sites, departments, bootstrap, and user scope assignment
- add `/api/v1/settings/numbering/*` APIs for sequence list, preview, reserve, and upsert flows
- extend auth scope context and API envelopes to carry branch access and `auditRef`
- add the `foundation_org_v1` Prisma migration and seed defaults for Kuwait timezone/currency foundation
- expose `/api/v1/health` with timezone, locale, and base currency metadata

## Verification
- `npm run lint`
- `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
- `npx jest tests/integration/api-v1-org-numbering.test.ts --runInBand`

## Notes
- validated on isolated worktree `.tmp/org-numbering-foundation`
- main worktree remained dirty and was not touched for this slice
