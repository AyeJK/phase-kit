# Phase 1 — Legacy Tables

Written before task tables had a Status column. Sprint 1.1 is still in the old format; sprint 1.2 was migrated on first touch.

---

# Sprint 1.1 — Old Format

### Goal

A task table with no Status column.

### Tasks

| # | Task | Module | Reference |
|---|------|--------|-----------|
| 1 | Parse the config file | src/config.ts | docs/config.md |
| 2 | Validate required keys | src/config.ts |
| 3 | Manual check on a real config |

### Acceptance Criteria

- Missing keys produce a readable error

### Dependencies

- None

---

# Sprint 1.2 — Migrated

### Goal

The same shape after migration: Status column added, one task done.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Load config from the environment | src/env.ts |
| — | 2 | Document every environment variable | README.md | docs/config.md |

### Acceptance Criteria

- Environment values override file values

### Dependencies

- Sprint 1.1

### Verification

- cli: npm test
- skip-ui: true
