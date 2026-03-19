## Summary
- add Prometheus metrics collection middleware and `/api/v1/metrics` and `/api/metrics` endpoints
- extend env configuration with `METRICS_ENABLED` and `METRICS_TOKEN`
- protect metrics access with optional token-based auth while keeping the endpoint scrapeable when no token is configured
- add `metrics-v1` integration coverage for traffic recording and token enforcement

## Verification
- `npm run lint`
- `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
- `npx jest tests/integration/metrics-v1.test.ts --runInBand`

## Notes
- validated on isolated worktree `.tmp/metrics-observability`
- this PR is stacked on `feat/org-numbering-foundation`
- main worktree remained dirty and was not touched for this slice
