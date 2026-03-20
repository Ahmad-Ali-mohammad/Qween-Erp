# Phase 0 Research: Integrated ERP Workflow Audit And Modernization

## Decision 1: Use a canonical system/workspace registry as the single source of truth

**Decision**: Treat the system registry as the canonical metadata source for
shell navigation, workspace sections, quick actions, and dashboard behavior,
then remove duplicated or hardcoded definitions from parallel frontend files.

**Rationale**: The current baseline shows the same system concepts repeated
across shell configuration and route mapping. That duplication makes extension
expensive and creates inconsistencies when one system is updated without the
others.

**Alternatives considered**:

- Keep separate route and workspace registries and document sync rules.
- Move all workspace decisions into each system module independently.

## Decision 2: Stabilize data and migrations before broad UX redesign

**Decision**: Prioritize schema alignment, seed readiness, and failing dashboard
or workflow endpoints before deep shell redesign work.

**Rationale**: The 2026-03-20 baseline already shows missing-table failures and
broken dashboard responses. Redesigning the shell before fixing data readiness
would produce a cleaner wrapper around still-broken workflows.

**Alternatives considered**:

- Redesign the shell first and defer workflow reliability to later waves.
- Patch only the visible dashboard errors and postpone schema verification.

## Decision 3: Use independent dashboard widget contracts with partial-failure envelopes

**Decision**: Define dashboard payload contracts per widget area and require
each widget to return either usable data or an explicit unavailable state,
without taking down the entire system landing page.

**Rationale**: Control-center and system dashboards currently fail as whole
pages when one backend dependency returns `500`. Independent envelopes preserve
operator usability and make failure diagnosis clearer.

**Alternatives considered**:

- Keep a page-level fail-fast dashboard contract.
- Hide failing widgets completely without surfacing their unavailable state.

## Decision 4: Repair workflows by domain slices, not by UI screen count

**Decision**: Group workflow completion by business domain and primary journey:
governance dashboards, budgeting/quality/maintenance/risk/scheduling,
projects/procurement/inventory/HR, then customization.

**Rationale**: The current failures cluster around domain readiness and contract
integrity rather than around isolated screens. Domain slices provide a more
reliable path for regression testing and rollout.

**Alternatives considered**:

- Fix whichever screen looks most broken first.
- Rewrite each system end-to-end before validating any domain slice.

## Decision 5: Layer customization defaults from system to company, role, then user

**Decision**: Personalization will use a layered model:
system default -> company preset -> role preset -> user saved view.

**Rationale**: This order keeps the product coherent by default, allows central
administration where needed, and still gives the end user a safe personal
override without weakening governance.

**Alternatives considered**:

- Role-only presets without user personalization.
- User-only customization with no administrative defaulting.

## Decision 6: Keep verification contract-driven and multi-layered

**Decision**: Use three verification layers:
integration tests for workflow correctness, contract/parity tests for registry
and dashboard surfaces, and browser smoke checks for workspace usability.

**Rationale**: No single test layer is enough for this initiative. API-only
tests miss shell regressions, while browser-only checks miss business-rule
failures and schema drift.

**Alternatives considered**:

- Rely only on browser smoke checks.
- Rely only on unit and integration tests.
