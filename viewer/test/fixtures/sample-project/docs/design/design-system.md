# Design System — Sample Project

_Last updated: example. This is a small illustrative design-system.md, not a template to copy verbatim — your own design-planner pass (or hand-authored file) will have your project's actual tokens._

## Design intent

Calm, utilitarian task-management tool. Legible over decorative. One accent color, used sparingly for primary actions and active states only.

## Design tokens

```css
:root {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e4e4e7;
  --color-text-primary: #18181b;
  --color-text-secondary: #71717a;
  --color-accent: #2563eb;
  --color-accent-text: #ffffff;
  --color-danger: #dc2626;
  --color-success: #16a34a;

  --font-body: system-ui, -apple-system, sans-serif;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 20px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;

  --radius-sm: 4px;
  --radius-md: 8px;
}
```

## Typography scale

| Element | Token |
|---|---|
| Page title | font-size-lg, 600 weight |
| Body text | font-size-base, 400 weight |
| Helper/meta text | font-size-sm, --color-text-secondary |

## Core component patterns

**Toggle** — pill shape, `--color-accent` when on, `--color-border` background when off. 44px min touch target on mobile.

**Settings row** — label left, control right, `--space-3` vertical padding, `1px solid --color-border` divider between rows.

## UI copy

- No agent/system narration in UI copy — short, direct labels only ("Email notifications", not "You will receive an email when...")
- Error messages state what happened and what to do next, in one sentence

## Screen index

| Surface | Spec | Route |
|---|---|---|
| Notification settings | screens/notification-settings.md | /settings/notifications |
