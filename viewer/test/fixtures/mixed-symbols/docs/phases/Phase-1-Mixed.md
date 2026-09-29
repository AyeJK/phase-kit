# Phase 1 – Mixed Symbols

Hand-edited status cells and sprint headers that drift from the canonical format. The phase header itself uses an en dash.

---

# Sprint 1.1 – En Dash Header

### Goal

Checkbox statuses and a hyphen for not started.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| [x] | 1 | Checkbox done, lowercase | src/a.ts |
| [X] | 2 | Checkbox done, uppercase | src/a.ts |
| [ ] | 3 | Checkbox not started | src/b.ts |
| - | 4 | Hyphen for not started | src/b.ts |
| – | 5 | En dash for not started | src/c.ts |
| — | 6 | Em dash for not started (canonical) | src/c.ts |

### Acceptance Criteria

- [x] Checkbox criterion, checked
- [ ] Checkbox criterion, unchecked
* Asterisk bullet criterion

### Dependencies

- None

### Verification

- cli: npm run check
- skip-ui: true

---

# Sprint 1.2: Colon Header

### Goal

Word statuses in other cases, and one status nobody recognises.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| X | 1 | Uppercase x for done | src/d.ts |
| blocked | 2 | Lowercase blocked | src/d.ts |
| Cut | 3 | Title-case cut | src/e.ts |
| deferred | 4 | Lowercase deferred | src/e.ts |
| WIP | 5 | Unrecognised status word | src/f.ts |

### Acceptance Criteria

- Unknown statuses are kept, not dropped

### Dependencies

- Sprint 1.1

### Verification

- CLI: npm test
- Skip-UI: TRUE

---

# Sprint 1.3 - Hyphen Header

### Goal

A plain hyphen as the header separator.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| ~ | 1 | In progress | src/g.ts |

### Acceptance Criteria

- Nothing extra

### Dependencies

- Sprint 1.2

### Verification

- cli: npm run check
- skip-ui: false
