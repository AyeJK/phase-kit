---
name: phase-doc-sync
description: "Applies sprint implementation results to docs/phases/ phase plan files. Used by phase-runner as a sub-agent after each implementation wave — updates task Status columns from structured SPRINT RESULT payloads in batched edits. Orchestrator must never edit phase files directly during a phase run; spawn this instead. Also use when the user asks to sync phase docs from sprint results without re-implementing code."
---

# Phase Doc Sync

Updates `docs/phases/Phase-*.md` task tables from structured sprint results. **Read-only for implementation code** — only touches phase plan markdown.

The **phase-runner orchestrator** spawns you as a sub-agent after each implementation wave. The orchestrator parses `SPRINT RESULT` blocks and passes a structured payload; you apply edits using **phase-planner** rules.

---

## Orchestrator contract (phase-runner)

The orchestrator MUST:

1. Parse each implementation sub-agent's `SPRINT RESULT:` block into structured data
2. Spawn **one** doc-sync call per wave (never edit `docs/phases/*.md` itself)
3. Wait for your `DOC SYNC RESULT:` block before advancing to the next wave
4. Log only a one-line summary per sprint (no direct edits to phase files in the orchestrator thread)

The orchestrator MUST NOT edit `docs/phases/*.md` during an active phase run.

---

## Input payload (from orchestrator)

The orchestrator includes this JSON in your prompt:

```json
{
  "phase_file": "docs/phases/Phase-11-Example-Feature.md",
  "project_root": "/path/to/workspace",
  "sprints": [
    {
      "id": "11.1",
      "title": "Example sprint title",
      "completed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "blocked": [],
      "blocked_reasons": {},
      "deferred": [],
      "cut": [],
      "notes": "optional string from SPRINT RESULT NOTES"
    }
  ],
  "user_overrides": []
}
```

**Field rules:**

| Field | Maps to Status |
|-------|----------------|
| `completed` | `x` |
| `blocked` | `BLOCKED` |
| `deferred` | `DEFERRED` |
| `cut` | `CUT` |
| `user_overrides` | After user says skip/defer — e.g. `[{ "id": "11.3", "task": 3, "status": "DEFERRED" }]` |

Process sprints in **ascending ID order** (`X.Y` numeric) even if the payload order differs.

If a task number appears in multiple lists, precedence: `blocked` > `deferred` > `cut` > `completed`.

---

## Execution steps

1. Load the **phase-planner** skill (per runtime-adapter.md in the phase-runner skill) and its `reference.md` if table format is unclear
2. Read the target **phase file** once
3. For each sprint in the payload (ascending `id`):
   - Locate section `# Sprint {id} — {title}`
   - Find the `### Tasks` table
   - Migrate table (add Status column) if missing — per phase-planner
   - Update Status cells for listed task numbers only
   - Leave task text, Module, Reference, acceptance criteria, dependencies unchanged
4. **Write discipline:**
   - **One edit per sprint section** when possible (replace the entire `### Tasks` table block)
   - If tables are too large for one match, **at most one edit per sprint** by matching from `### Tasks` through the row before `### Acceptance`
   - **Never** one edit per task row
   - **One write pass per phase file** for the whole payload (batch all sprint edits before writing, or sequential edits on the same file in one session — still no per-row spam)
5. Re-read the file and verify every listed task has the expected status
6. End with `DOC SYNC RESULT:` (required)

---

## Status column values

| Value | Meaning |
|-------|---------|
| `x` | Completed |
| `BLOCKED` | Blocked |
| `DEFERRED` | Deferred |
| `CUT` | Cut from scope |
| `—` | Not started (do not change unless explicitly in payload as reset) |
| `~` | In progress (only set if orchestrator requests `mark_active`) |

Do not change tasks not mentioned in the payload unless the orchestrator sends `mark_sprint_done: true` for a sprint with empty lists — then set **all** `—` and `~` rows in that sprint to `x` (whole sprint complete).

---

## Output block (required)

```
DOC SYNC RESULT:
STATUS: SUCCESS | PARTIAL | FAILED
FILE: {path relative to project root}
SPRINTS_SYNCED: {comma-separated sprint ids, or NONE}
TASKS_UPDATED: {total count}
FAILURES: [sprint id + reason per line, or NONE]
NOTES: [formatting issues, ambiguous rows, anything orchestrator should know]
```

- **SUCCESS** — every requested status applied and verified
- **PARTIAL** — some sprints updated; list in FAILURES
- **FAILED** — file not found, no matching sprint section, or could not apply without guessing

---

## Prompt template (orchestrator fills braces)

```
You are the phase doc-sync agent. Update phase plan task statuses only.

Read and follow: the phase-doc-sync skill (loaded per runtime-adapter.md)
Read and follow: the phase-planner skill (loaded per runtime-adapter.md)

PROJECT ROOT: {project_root}
PHASE FILE: {phase_file}

PAYLOAD:
{json payload}

RULES:
- Edit ONLY the phase file task Status columns for sprints in the payload
- Batch edits — never one edit per task row
- Do not modify acceptance criteria, dependencies, or overview prose
- End with DOC SYNC RESULT block

If SPRINT RESULT was missing for a sprint but orchestrator verified acceptance and sent mark_sprint_done, mark all incomplete tasks in that sprint as x.
```

---

## Error handling

| Situation | DOC SYNC STATUS | Action |
|-----------|-----------------|--------|
| Phase file not found | FAILED | Report path; orchestrator confirms location |
| Sprint header not found | PARTIAL or FAILED | List in FAILURES; do not edit wrong section |
| Task # not in table | PARTIAL | Note in FAILURES; continue other tasks |
| Table has no Status column | SUCCESS after migrate | Migrate atomically per phase-planner |
| Ambiguous duplicate task text | FAILED | Do not guess; list row in NOTES |

---

## Example

**Input:** Sprint 11.2, completed `[1,2,3,4,5,6,7]`, blocked `[]`

**Action:** Single edit on the `### Tasks` table under `# Sprint 11.2`, flipping `| — |` to `| x |` for tasks 1–7 only.

**Output:**

```
DOC SYNC RESULT:
STATUS: SUCCESS
FILE: docs/phases/Phase-11-Example-Feature.md
SPRINTS_SYNCED: 11.2
TASKS_UPDATED: 7
FAILURES: NONE
NOTES: none
```
