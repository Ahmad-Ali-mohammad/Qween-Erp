---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for business-critical logic, public API changes,
approval/posting flows, Prisma schema changes, and regression fixes. They may
be omitted only for low-risk content/configuration work when the plan explains
why.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend/API**: `src/modules/`, `src/contracts/`, `src/platform/`,
  `src/middleware/`, `src/config/`
- **Frontend**: `frontend/js/`, `frontend/styles/`, `frontend/index.html`
- **Data layer**: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`
- **Tests**: `tests/integration/`, `tests/unit/`, `tests/setup/`
- **Docs/Ops**: `README.md`, `API_ENDPOINTS.md`, `docs/`, `runbooks/`

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Confirm impacted repository paths from the plan (`src/`, `frontend/`,
      `prisma/`, `tests/`, docs)
- [ ] T002 Update shared configuration or environment contracts if required in
      `src/config/` and `.env.example`
- [ ] T003 [P] Prepare or extend test fixtures/helpers in `tests/` for the
      feature slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Update `prisma/schema.prisma` and add migration files if the feature
      changes persisted data
- [ ] T005 [P] Add or update shared DTOs/contracts in `src/contracts/`
- [ ] T006 [P] Extend route/module scaffolding in `src/modules/`
- [ ] T007 Add required permissions, guards, or shared business helpers in
      `src/constants/`, `src/middleware/`, or `src/modules/shared/`
- [ ] T008 Add audit logging, outbox, or platform integration hooks in
      `src/platform/` where cross-boundary behavior changes
- [ ] T009 Update API/operator documentation in `API_ENDPOINTS.md`, `docs/`, or
      `runbooks/` when the contract or workflow changes

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Add or update integration coverage for [user journey] in
      `tests/integration/[feature].test.ts`
- [ ] T011 [P] [US1] Add or update unit coverage for [service/helper] in
      `tests/unit/[feature].test.ts`

### Implementation for User Story 1

- [ ] T012 [P] [US1] Update data model or repository access in
      `prisma/schema.prisma` or `src/modules/[module]/service.ts`
- [ ] T013 [P] [US1] Implement contract/validation changes in
      `src/contracts/[domain].ts` or related DTO files
- [ ] T014 [US1] Implement service logic in `src/modules/[module]/service.ts`
- [ ] T015 [US1] Implement route/controller wiring in
      `src/modules/[module]/route.ts`
- [ ] T016 [US1] Implement frontend workspace updates in
      `frontend/js/[area]/[file].js` and related styles if user-facing
- [ ] T017 [US1] Add audit/logging/outbox behavior and error handling for the
      user story

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 ⚠️

- [ ] T018 [P] [US2] Add or update integration coverage for [user journey] in
      `tests/integration/[feature].test.ts`
- [ ] T019 [P] [US2] Add or update unit coverage for [service/helper] in
      `tests/unit/[feature].test.ts`

### Implementation for User Story 2

- [ ] T020 [P] [US2] Update supporting entities/contracts in `src/contracts/`,
      `prisma/`, or `src/modules/shared/`
- [ ] T021 [US2] Implement service logic in `src/modules/[module]/service.ts`
- [ ] T022 [US2] Implement route/frontend behavior in
      `src/modules/[module]/route.ts` and/or `frontend/js/[area]/[file].js`
- [ ] T023 [US2] Integrate with User Story 1 components and shared dashboards if
      needed

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] Add or update integration coverage for [user journey] in
      `tests/integration/[feature].test.ts`
- [ ] T025 [P] [US3] Add or update unit coverage for [service/helper] in
      `tests/unit/[feature].test.ts`

### Implementation for User Story 3

- [ ] T026 [P] [US3] Update remaining entities/contracts in `prisma/` or
      `src/contracts/`
- [ ] T027 [US3] Implement service logic in `src/modules/[module]/service.ts`
- [ ] T028 [US3] Implement route/frontend behavior in
      `src/modules/[module]/route.ts` and/or `frontend/js/[area]/[file].js`

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in `docs/`, `runbooks/`, `README.md`, or
      `API_ENDPOINTS.md`
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit/integration regression tests in `tests/unit/` or
      `tests/integration/`
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Integration test for [user journey] in tests/integration/[feature].test.ts"
Task: "Unit test for [service/helper] in tests/unit/[feature].test.ts"

# Launch all models for User Story 1 together:
Task: "Update contract in src/contracts/[domain].ts"
Task: "Update frontend workspace in frontend/js/[area]/[file].js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
