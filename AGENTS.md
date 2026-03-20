# ERP Qween Development Guidelines

Auto-generated from active feature plans. Last updated: 2026-03-20

## Active Technologies

- TypeScript 5.6 on Node.js 20.x
- Express 4
- Prisma 5
- Zod
- Jest
- Supertest
- TSX
- Browser JavaScript modules under `frontend/js/`
- PostgreSQL via Prisma

## Project Structure

```text
src/
frontend/
prisma/
tests/
docs/
```

## Commands

- `npm test`
- `npm run lint`
- `npm run check:encoding`
- `npm run prisma:generate`
- `npm run prisma:deploy`

## Code Style

- Follow existing TypeScript and browser-JavaScript conventions already used in
  the repository.
- Keep backend contracts explicit under `src/contracts/`.
- Keep frontend workspace behavior aligned with the shared shell/system
  registry.

## Recent Changes

- `codex/001-integrated-erp-workflows`: Added Spec Kit planning workflow and
  implementation planning artifacts for ERP workflow audit, shell redesign, and
  governed customization.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
