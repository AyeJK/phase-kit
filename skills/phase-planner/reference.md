# Phase Planner — Reference

Format specification and edge cases too detailed for the main SKILL.md.

---

## Full phase file template

```markdown
# Phase {N} — {Phase Title}

{One-paragraph phase goal — what this phase delivers and why it's scoped this way.}

---

# Sprint {N}.1 — {Sprint Title}

### Goal

{One sentence — what this sprint accomplishes.}

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | {task} | {path} | {doc} |
| — | 2 | {task} | {path} |
| — | 3 | {task} |

### Acceptance Criteria

- {Observable, testable outcome}
- {Observable, testable outcome}

### Dependencies

- {Prior sprint, external service, or "None"}

### Verification

- cli: {check command}
- ui: {route, if applicable}
- skills: {skill names, if any UI/QA skills are installed}
- assert: {what PASS means, one line per check}

---

# Sprint {N}.2 — {Sprint Title}

...

---

## Risk Mitigations

{Optional section — known risks for this phase and how they're handled. Free-form prose, not a task table.}

## Scope Guard

{Optional section — explicit statement of what this phase does NOT include, to prevent scope creep during implementation.}
```

Non-sprint sections (Risk Mitigations, Scope Guard, or anything else free-form) go **after** the last sprint, never between sprints.

---

## Sprint numbering edge cases

- **Gaps are fine.** If Sprint 1.2 is cut entirely (not just tasks within it), do not renumber 1.3 → 1.2. Sprint numbers, unlike task numbers, are not required to be contiguous — they're a stable reference used in conversation and in doc-sync payloads. Mark the whole sprint `CUT` in its Goal line instead of deleting the section.
- **Inserting a sprint between existing ones** (e.g. adding new work between 1.2 and 1.3): use decimal insertion (`1.2.5`) only if the user explicitly wants to preserve exact ordering without renumbering everything after it. Otherwise, prefer appending to the end and noting the dependency — cleaner long-term.
- **Cross-phase sprint moves** are rare; when they happen, the sprint keeps its title but takes the next sequential number in the target phase. Note the origin in a one-line comment under the Goal.

## Malformed or legacy tables

- **No Status column at all:** migrate per the main SKILL.md migration steps before any other edit.
- **Inconsistent status symbols** (e.g. some files use `[ ]`/`[x]` checkbox style instead of `—`/`x`): convert to the canonical symbol set on first touch, same as a missing-column migration. Note the conversion in your response so the user isn't surprised by an unrelated-looking diff.
- **Duplicate task numbers** within one sprint (copy-paste error): flag it, don't guess which one is canonical — ask the user which to keep before any edit that touches that sprint.
- **Task row with no plausible Module** (pure research/manual/decision tasks): this is expected and fine — use the three-column sparse form (`| Status | # | Task |`).

## Verification section absent on an old sprint

Do not backfill `### Verification` on completed or already-in-progress sprints just because you're touching the file for something else. Only add it when the user explicitly asks to backfill, or when adding a **new** sprint (where it's mandatory).

## Multiple phase files touched in one operation

When an operation (e.g. Move Task cross-phase) requires editing two files, read both **before** writing either — if one file turns out to have an unexpected shape (missing sprint, wrong header format), abort before any write rather than leaving one file edited and the other not.
