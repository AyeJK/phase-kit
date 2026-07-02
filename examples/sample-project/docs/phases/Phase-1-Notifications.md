# Phase 1 — Notifications

Add in-app and email notifications for task assignment and due-date reminders. This phase covers the data layer, the notification-sending logic, and the settings UI where users control what they receive.

---

# Sprint 1.1 — Notification Schema and Queue

### Goal

Add the notification data model and a durable send queue, with no UI yet.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Add `notifications` table (recipient, type, payload, sent_at, read_at) | db/migrations/ |
| x | 2 | Add `notification_preferences` table (user_id, channel, event_type, enabled) | db/migrations/ |
| x | 3 | Queue worker that reads pending notifications and dispatches by channel | src/notifications/queue.ts |
| x | 4 | Unit tests for queue dispatch logic | src/notifications/queue.test.ts |

### Acceptance Criteria

- A row inserted into `notifications` with `sent_at IS NULL` is picked up and sent within one queue tick
- Disabled preferences are respected — no send attempted for a disabled channel/event combo

### Dependencies

- None

### Verification

- cli: npm run check
- skip-ui: true

---

# Sprint 1.2 — Notification Settings UI

### Goal

Let users see and edit their notification preferences.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Settings page section listing all event types with per-channel toggles | src/pages/settings/notifications.tsx | docs/design/screens/notification-settings.md |
| x | 2 | Save preferences on toggle, optimistic UI update | src/pages/settings/notifications.tsx | docs/design/screens/notification-settings.md |
| x | 3 | Empty/loading/error states per screen spec | src/pages/settings/notifications.tsx | docs/design/screens/notification-settings.md |

### Acceptance Criteria

- Toggling a channel off persists immediately and survives a page reload
- Page matches `docs/design/screens/notification-settings.md` states matrix

### Dependencies

- Sprint 1.1 (preferences table must exist)

### Verification

- cli: npm run check
- ui: /settings/notifications
- skills: visual-qa-testing, responsive-testing
- viewports: 375, 768, 1280
- assert: All event types listed; toggles reflect saved state after reload; no layout break at 375px

---

## Scope Guard

This phase does not include push notifications (mobile) or a notification history/inbox view — both deferred to a later phase pending user research on whether they're wanted.
