# Phase 1 — Sparse Rows

Task rows that omit trailing Module and Reference cells, as phase-planner writes them.

---

# Sprint 1.1 — Every Row Shape

### Goal

One table with 5-, 4- and 3-cell rows under a full five-column header.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Five cells: module and reference | src/api/client.ts | docs/api.md |
| x | 2 | Four cells: module only | src/api/retry.ts |
| ~ | 3 | Three cells: neither module nor reference |
| — | 4 | Four cells: reference only | docs/design/screens/settings.md |
| — | 5 | Five cells with a placeholder module | — | docs/api.md#errors |

### Acceptance Criteria

- Retries back off exponentially

### Dependencies

- None

### Verification

- cli: npm run check
- skip-ui: true

---

# Sprint 1.2 — Reference-Only Table

### Goal

A table whose header has Reference but no Module column.

### Tasks

| Status | # | Task | Reference |
|--------|---|------|-----------|
| — | 1 | Write the API guide | docs/api.md |
| — | 2 | Review the guide with support |

### Acceptance Criteria

- Support signs off on the guide

### Dependencies

- Sprint 1.1
