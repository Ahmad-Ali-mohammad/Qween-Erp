# Contract: Dashboard Payloads

## Purpose

Defines the response expectations for system landing dashboards so widget
failures do not collapse the entire workspace.

## Standard Widget Envelope

Each dashboard widget response must resolve to:

- `status`: `ok`, `empty`, or `unavailable`
- `generatedAt`: Server timestamp for the payload
- `data`: Widget-specific content when available
- `message`: Operator-facing explanation when status is `empty` or
  `unavailable`
- `warnings`: Optional non-blocking concerns

## Required Widget Families

- `summary`
- `alerts`
- `queues`
- `activity`
- `charts`

## Rules

- A widget returning `unavailable` must not cause sibling widgets to fail.
- `message` content must distinguish between "no data yet" and "service
  unavailable".
- Widgets must remain permission-aware and avoid leaking data outside the
  current user's scope.
- The workspace shell must render partial success states predictably across
  control center and all system dashboards.

## Operator Expectations

- If one widget is unavailable, the user can still navigate to records and
  primary actions.
- The dashboard should surface the unavailable state clearly enough that support
  teams can diagnose it without reading raw logs.
