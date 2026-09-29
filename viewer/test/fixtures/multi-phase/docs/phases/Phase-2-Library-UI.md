# Phase 2 — Library UI

The pages people use every day: the library grid, shelf pages and search.

This phase is in progress, so its sprints mix every task status.

---

# Sprint 2.1 — Library Grid

### Goal

Show every book as a cover grid with sort and filter.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Library page with a responsive cover grid | src/pages/library.tsx | docs/design/screens/library.md |
| ~ | 2 | Sort by title, author and date added | src/pages/library.tsx |
| BLOCKED | 3 | Cover images from Open Library (API key pending) | src/covers/openlibrary.ts |
| — | 4 | Empty state when the library has no books | src/pages/library.tsx | docs/design/screens/library.md |

### Acceptance Criteria

- The grid reflows from 2 to 6 columns between 375px and 1536px
- Sort order survives a page reload

### Dependencies

- Phase 1 (import pipeline fills the books table)
- Sprint 1.2 (dedupe keeps the grid free of repeats)

### Verification

- cli: npm run check
- ui: /library
- skills: visual-qa-testing, responsive-testing
- viewports: 375, 768, 1280, 1536
- assert: Grid shows every seeded book
- assert: No layout break at 375px

---

# Sprint 2.2 — Shelves

### Goal

Let people group books into shelves.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | Shelf page listing its books | src/pages/shelf.tsx |
| — | 2 | Add to shelf / remove from shelf actions | src/shelves/actions.ts |
| CUT | 3 | Drag books between shelves | src/pages/shelf.tsx |

### Acceptance Criteria

- A book can sit on more than one shelf

### Dependencies

- Sprint 2.1 (shelf pages reuse the grid)

---

# Sprint 2.3 — Search

### Goal

Search the library by title, author or ISBN.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | Search box in the app header | src/components/SearchBox.tsx |
| — | 2 | Search results page | src/pages/search.tsx | docs/design/screens/search.md |
| DEFERRED | 3 | Fuzzy matching on author names | src/search/fuzzy.ts |

### Acceptance Criteria

- Searching an exact ISBN returns that one book

### Dependencies

- Sprint 2.1 (results use the grid)
- Sprint 1.2

### Verification

- cli: npm run check
- ui: /search?q=dune, /library
- skills: visual-qa-testing
- assert: Results update as you type
- timeout: 30

---

## Scope Guard

No recommendations and no social features in this phase.

## Risk Mitigations

- Open Library rate limits: cache covers locally after the first fetch.
- Large libraries: the grid virtualizes past 500 books.
