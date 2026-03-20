# Contract: Workspace Personalization

## Purpose

Defines how governed customization applies to system workspaces without
overriding permissions or business controls.

## Layers

Customization is resolved in this order:

1. System default
2. Company preset
3. Role preset
4. User saved view

Later layers may refine earlier ones but may not violate locked controls or
permissions.

## Preset Shape

- `scopeType`
- `scopeValue`
- `systemKey`
- `defaultLayout`
- `defaultFilters`
- `defaultQuickActions`
- `lockedElements`
- `status`

## Saved View Shape

- `userId`
- `systemKey`
- `filters`
- `columnVisibility`
- `sortOrder`
- `quickActionPins`
- `appliedPresetKey`

## Rules

- Restricted actions remain hidden or blocked regardless of preset content.
- Locked elements defined by a higher layer cannot be removed by a lower layer.
- Invalid saved-view entries are ignored selectively instead of breaking the
  whole workspace.
- Personalization applies only to supported sections and fields documented by
  the workspace blueprint.
