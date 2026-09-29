# Phase 1 — Foundations

Set up the bookshelf app's data layer and the import pipeline. Every later phase reads from these tables.

---

# Sprint 1.1 — Schema

### Goal

Create the books and shelves tables with seed data.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Add `books` table (title, author, isbn, added_at) | db/migrations/ | docs/spec.md#books |
| x | 2 | Add `shelves` table and the `shelf_books` join table | db/migrations/ |
| x | 3 | Seed script with 20 sample books | scripts/seed.ts |

### Acceptance Criteria

- Migrations apply cleanly on an empty database
- The seed script is idempotent

### Dependencies

- None

### Verification

- cli: npm run check
- skip-ui: true

---

# Sprint 1.2 — Import Pipeline

### Goal

Import a Goodreads CSV export into the books table.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | CSV parser for the Goodreads export format | src/import/csv.ts | docs/spec.md#import |
| x | 2 | Deduplicate by ISBN, then by title and author | src/import/dedupe.ts |
| x | 3 | Unit tests with a 500-row sample export | src/import/csv.test.ts |

### Acceptance Criteria

- Importing the same file twice adds no duplicate rows

### Dependencies

- Sprint 1.1 (books table must exist)

### Verification

- cli: npm run check
- skip-ui: true

---

## Scope Guard

No sync with Goodreads itself: the import is a one-off file upload.
