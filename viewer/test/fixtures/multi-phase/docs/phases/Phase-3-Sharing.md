# Phase 3 — Sharing

Public shelf links and a reading-stats page. Not started.

---

# Sprint 3.1 — Public Shelves

### Goal

Share a read-only link to one shelf.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | Public shelf route with an unguessable slug | src/pages/public/shelf.tsx |
| — | 2 | Toggle to make a shelf public | src/shelves/actions.ts |
| DEFERRED | 3 | Open Graph preview image for shared links | src/og/shelf.ts |

### Acceptance Criteria

- A private shelf's link returns 404

### Dependencies

- Phase 2
- Sprint 2.2 (shelves must exist)

### Notes

The slug format is still open: nanoid(10) or a word list.

### Verification

- cli: npm run check
- ui: /s/example-slug
- skills: visual-qa-testing
- assert: Public page shows the shelf's books and no edit controls

---

# Sprint 3.2 — Reading Stats

### Goal

A stats page: books per month, pages per year.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | Stats queries | src/stats/queries.ts |
| — | 2 | Stats page with two charts | src/pages/stats.tsx | docs/design/screens/stats.md |
| MANUAL | 3 | Manual check against a hand-counted month |

### Acceptance Criteria

- Totals match a hand count for one sample month

### Dependencies

- Sprint 3.1, Sprint 1.1

### Verification

- cli: npm run check
- ui: /stats
- skills: visual-qa-testing, responsive-testing
- assert: Both charts render with seeded data
