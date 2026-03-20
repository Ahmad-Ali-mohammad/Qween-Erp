# Contract: System Workspace Registry

## Purpose

Defines the canonical metadata the shell, workspaces, and downstream modules
must share for every registered ERP system.

## Registry Entry

Each system entry must provide:

- `key`: Stable system identifier.
- `title`: Human-readable Arabic title.
- `group`: High-level grouping used in shell navigation.
- `permission`: Required scope to open the system.
- `route`: Primary landing route.
- `namespace`: Backend/frontend ownership namespace.
- `theme`: Visual theme token group.
- `summary`: Short operator-facing description.
- `layout`: Ordered workspace sections.
- `quickActions`: Operator shortcuts with label and path.
- `moneyKeys`: Optional business summary keys for financial surfaces.
- `fallbackPolicy`: How the workspace behaves if one data source fails.

## Rules

- `key`, `route`, and `namespace` must remain stable across frontend and
  backend contract surfaces.
- `layout` must map only to supported workspace sections.
- `quickActions` must be filtered by permission and scope before rendering.
- Missing optional data cannot invalidate the whole workspace.

## Supported Workspace Sections

- `hero`
- `overview`
- `summary`
- `records`
- `actions`
- `approvals`
- `queues`
- `alerts`
- `charts`
- `activity`

## Compatibility Expectations

- Shell navigation, route registry, and workspace configuration must derive from
  this registry or documented transforms of it.
- New systems are not production-ready until a registry entry and primary
  workflow definition both exist.
