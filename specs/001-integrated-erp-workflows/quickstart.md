# Quickstart: Integrated ERP Workflow Audit And Modernization

## 1. Prepare the environment

1. Install dependencies with `npm install`.
2. Ensure the application environment variables are present.
3. Generate Prisma client with `npm run prisma:generate`.

## 2. Align schema and seed state

1. Apply pending migrations with `npm run prisma:deploy` or the team-approved
   local migration flow.
2. Run `npm run prisma:seed` if the target environment depends on reference
   data for system workflows.
3. Confirm that maintenance, risk, and scheduling tables exist before treating
   their failures as application bugs.

## 3. Run the backend verification baseline

1. Execute `npm test`.
2. Record which suites still fail after schema alignment.
3. Re-run targeted suites for dashboards and the currently broken systems after
   each domain slice is repaired.

## 4. Validate the frontend shell and workspaces

1. Start the application with `npm run dev`.
2. Open the main dashboard and at least these system workspaces:
   control center, accounting, procurement, projects, quality, maintenance,
   risk, and scheduling.
3. Confirm the workspace still allows navigation and primary actions even if one
   dashboard area is unavailable.
4. Run `npm run check:encoding` whenever Arabic text or labels are changed.

## 5. Validate the personalization layer

1. Create one preset for an administrative role and one for an operational role.
2. Confirm the lower-priority user view respects locked or forbidden elements.
3. Confirm restricted actions remain hidden or blocked even when a preset or
   saved view tries to surface them.

## 6. Finish the planning loop

1. Review [research.md](./research.md), [data-model.md](./data-model.md), and
   the contracts under [contracts](./contracts).
2. Generate the implementation task breakdown with `/speckit.tasks`.
