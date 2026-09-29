# Notification Settings

**Route/shell:** `/settings/notifications`, full page within the settings shell
**Phase:** 1
**Purpose:** Let users control which notification events they receive and on which channels.

## Layout

```
[Settings sidebar] | [Notification Settings]
                    |
                    | Task assigned to you        [Email: on] [In-app: on]
                    | ------------------------------------------------
                    | Due date approaching         [Email: off][In-app: on]
                    | ------------------------------------------------
                    | Comment on your task         [Email: on] [In-app: on]
```

## Components

- Settings row (see design-system.md)
- Toggle (see design-system.md)

## States

| State | Behavior |
|-------|----------|
| Empty | Not applicable — event types are fixed, always at least one row |
| Loading | Skeleton rows matching final row height, no layout shift on load |
| Error | Inline banner above the list: "Couldn't load your preferences. Retry." with a retry button |
| Success | Toggle flips immediately (optimistic), no confirmation toast needed |
| Save failure | Toggle reverts, inline error text below that row only |

## Copy rules

- Event type labels are plain descriptions, not system event names ("Task assigned to you", not `task.assigned`)
- No "Save" button — every toggle persists on change

## Acceptance bullets

- All configured event types render as rows on load
- Toggling any control persists the change and survives a full page reload
- Failed save reverts the toggle and shows an inline error on that row only
- No horizontal scroll or overlapping controls at 375px viewport width

**Preview:** notification-settings.html (create alongside this spec when running a real design pass — omitted here since this is a documentation example, not a live design-planner output)
