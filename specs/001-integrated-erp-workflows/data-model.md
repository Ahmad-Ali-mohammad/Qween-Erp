# Data Model: Integrated ERP Workflow Audit And Modernization

## 1. System Health Snapshot

**Purpose**: Captures the tested state of a registered ERP system at a point in
time so the team can track readiness and blockers.

**Core fields**:

- `systemKey`: Stable identifier matching the registered system.
- `status`: `working`, `partial`, `broken`.
- `primaryJourney`: The journey used for classification.
- `dashboardState`: Summary of landing workspace health.
- `blockerSummary`: Most important reason the system is not fully working.
- `evidence`: References to failing tests, endpoint states, or UI findings.
- `testedAt`: Timestamp of the latest review.
- `testedBy`: Reviewer or automation identity.
- `retestState`: `not-needed`, `required`, `scheduled`, `verified`.

**Rules**:

- A snapshot is not `working` unless both the landing workspace and the primary
  workflow succeed without undocumented manual repair.
- A snapshot moves back to `partial` or `broken` if a regression invalidates the
  verified journey.

## 2. Workspace Blueprint

**Purpose**: Defines the canonical structure of a system landing workspace.

**Core fields**:

- `systemKey`
- `title`
- `group`
- `defaultRoute`
- `sections`: Ordered areas such as overview, records, actions, approvals, and
  activity.
- `quickActions`: Allowed shortcuts visible by scope.
- `dashboardWidgets`: Widget identities and fallback expectations.
- `visibilityRules`: Role and scope constraints for sections or actions.
- `mobileBehavior`: Rules for how the workspace collapses or prioritizes content
  on smaller viewports.

**Rules**:

- A blueprint cannot expose actions that the visibility rules do not permit.
- The workspace remains valid even if one dashboard widget is unavailable.

## 3. Workflow Definition

**Purpose**: Represents the primary end-to-end business journey for one system.

**Core fields**:

- `workflowKey`
- `systemKey`
- `actorRole`
- `entryPoint`
- `prerequisites`
- `recordType`
- `allowedTransitions`
- `immutableStates`
- `successOutputs`
- `downstreamSurfaces`
- `recoveryPath`

**Rules**:

- Each system in scope must have at least one primary workflow definition.
- The recovery path must explain what happens if downstream refreshes or side
  effects fail after the business action is committed.

## 4. Workspace Preset

**Purpose**: Provides governed defaults for a workspace at system, company, or
role scope.

**Core fields**:

- `presetKey`
- `scopeType`: `system-default`, `company`, `role`.
- `scopeValue`
- `systemKey`
- `defaultLayout`
- `defaultFilters`
- `defaultQuickActions`
- `lockedElements`
- `status`

**Rules**:

- Presets may refine layout and visibility but cannot bypass permissions or
  mandatory review steps.
- Locked elements override lower-priority customization layers.

## 5. Saved View

**Purpose**: Stores end-user personalization within allowed workspace limits.

**Core fields**:

- `viewKey`
- `userId`
- `systemKey`
- `appliedPresetKey`
- `filters`
- `columnVisibility`
- `sortOrder`
- `quickActionPins`
- `lastUsedAt`

**Rules**:

- A saved view is evaluated after the applicable system, company, and role
  preset layers.
- If a saved view conflicts with current permissions, the disallowed pieces are
  ignored and the remaining safe configuration still loads.

## Relationships

- A `System Health Snapshot` belongs to one registered system and references one
  `Workflow Definition`.
- A `Workspace Blueprint` belongs to one registered system and constrains which
  `Workspace Preset` values are valid.
- A `Workspace Preset` can apply to many users through company or role scope.
- A `Saved View` belongs to one user and optionally points to the preset it was
  derived from.

## Planned Persistence Notes

- `System Health Snapshot` can start as a spec/report artifact before becoming a
  persisted record.
- `Workspace Blueprint` is expected to remain code-driven and contract-backed.
- `Workspace Preset` and `Saved View` are the most likely candidates for future
  Prisma persistence once the customization wave begins.
