---
name: push-update-summary
description: "Prepare a concise change summary before git push, PR creation, or progress comments. Use when the user asks to push code, open or update a pull request, write a status comment, or describe what development work and improvements were completed."
---

# Push Update Summary

Use this skill after implementation and verification are complete, and before:

- `git push`
- creating or updating a PR
- writing a progress comment, handoff note, or status update

## Goal

Always include a short, concrete description of:

- what was developed
- what was improved or stabilized
- what was verified
- what remains blocked or notable

Do this even when the push or PR action succeeds.

## Minimal inputs to inspect

Read only the smallest relevant set:

- `git branch -vv`
- `git log --oneline <base>..HEAD`
- `git diff --stat <base>..HEAD`
- targeted verification commands already run for the change

If the worktree is dirty, summarize only the scoped branch or commit range. Do not attribute unrelated local changes to the delivered work.

## Output shape

Prefer Arabic by default in this repository. Keep commands, branch names, commit hashes, paths, and API/code identifiers as literals.

Use this structure:

1. `التطوير`: new behavior, endpoints, refactors, or workflow changes
2. `التحسينات`: fixes, hardening, stability, performance, or cleanup
3. `التحقق`: tests, lint, guardrails, builds, or isolated verification
4. `ملاحظات`: blockers, auth issues, dirty worktree boundaries, or follow-up items

## Push and PR rules

- When pushing a branch, mention the branch name and whether the push targeted a feature branch or default branch.
- When preparing a PR, include a ready-to-paste title and body if the PR cannot be created automatically.
- When blocked by auth or network, still provide the exact summary that should accompany the push or comment.
- When multiple commits exist, summarize the net delivered outcome, not the full commit archaeology, unless the user asks for commit-level detail.

## Default template

```md
## التطوير
- ...

## التحسينات
- ...

## التحقق
- `...`

## ملاحظات
- ...
```

## Repo-specific rule

For ERP Qween work, if backend modules, Prisma behavior, integration tests, or app routing changed, mention the exact verification scope that passed, and explicitly note whether the summary was validated on the main worktree or an isolated worktree.
