---
name: phase-doc-sync
description: "Applies sprint implementation results to docs/phases/ phase plan files. Used by phase-builder as a sub-agent after each implementation wave — updates task Status columns from structured SPRINT RESULT payloads in batched edits. Orchestrator must never edit phase files directly during a phase run; spawn this instead. Also use when the user asks to sync phase docs from sprint results without re-implementing code."
---

# Phase Doc Sync

Updates `docs/phases/Phase-*.md` task tables from structured sprint results. **Read-only for implementation code** — only touches phase plan markdown, plus the run log when the payload has `run_log`.

The **phase-builder orchestrator** spawns you as a sub-agent after each implementation wave. The orchestrator parses `SPRINT RESULT` blocks and passes a structured payload; you apply edits using **phase-planner** rules.

---

## Orchestrator contract (phase-builder)

The orchestrator MUST:

1. Parse each implementation sub-agent's `SPRINT RESULT:` block into structured data
2. Spawn **one** doc-sync call per wave (never edit `docs/phases/*.md` itself)
3. Wait for your `DOC SYNC RESULT:` block before advancing to the next wave
4. Log only a one-line summary per sprint (no direct edits to phase files in the orchestrator thread)

The orchestrator MUST NOT edit `docs/phases/*.md` during an active phase run.

**Model (optional):** this role is mechanical — flip Status cells from a structured payload — a good candidate for a cheaper/faster model. If `runtime-adapter.md` resolved a `gate_model`, spawn this call with it. Otherwise use the session default; this is a cost optimization, never a blocker.

---

## Input payload (from orchestrator)

The orchestrator includes this JSON in your prompt:

```json
{
  "phase_file": "docs/phases/Phase-11-Example-Feature.md",
  "project_root": "/path/to/workspace",
  "app_root": "/path/to/app-root",
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
  "user_overrides": [],
  "run_log": {
    "path": "/path/to/workspace/docs/phases/.runs/phase-11.jsonl", "phase": 11, "wave": 1, "attempt": 1, "max": 1,
    "diff_base": "git tree sha the wave started from, or null"
  }
}
```

`run_log` is optional. When present, append `doc_sync` events after the snapshot (see Run log); when absent, write nothing.

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

1. Load the **phase-planner** skill (per runtime-adapter.md in the phase-builder skill) only if a table needs migrating or its format is unclear. A table that already has a Status column doesn't need it.
2. **Don't read the whole phase file.** Grep it for the sprint headers (`^# Sprint`) and the task rows (`^\| .* \| \d+ \|`) with line numbers, then read only the `### Tasks` table of each sprint in the payload (offset/limit).
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
5. Verify with the same grep: every listed task shows the expected status. Don't re-read the file.
6. **Snapshot for the next wave.** From `app_root`, run the `snap` function from the phase-verify skill's Review contract (a git tree of the whole working state, built with a temporary index — never stage or commit). It runs after your edits, so the next wave's review won't mistake them for implementer changes. `snap` exits non-zero or prints nothing (not a git repo, git error) → `SNAPSHOT: NONE` with the reason; never report an empty sha, and never fail the sync over it.
6b. **Log the sync** — once STATUS is decided, if `run_log` is present, append one `doc_sync` line per sprint in the payload, with the wave's `files` (see [Run log](#run-log))
7. End with `DOC SYNC RESULT:` (required)

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
SNAPSHOT: {git tree sha of app_root after this sync, or NONE — reason}
NOTES: [formatting issues, ambiguous rows, anything orchestrator should know]
```

- **SUCCESS** — every requested status applied and verified
- **PARTIAL** — some sprints updated; list in FAILURES
- **FAILED** — file not found, no matching sprint section, or could not apply without guessing

---

## Run log

Only when the payload has `run_log`. The spec is phase-builder's `run-log.md`; this is the part you need. Never write the log with a file-edit tool.

**1. The wave's changed files.** Skip this line when `run_log.diff_base` is null or `SNAPSHOT` is `NONE`; the events then carry no `files`. Otherwise run it first, in the same command as the appends, with `{app_root}` = APP ROOT, `{diff_base}` = `run_log.diff_base` and `{snapshot}` = your SNAPSHOT sha:

```sh
RL_FILES=$(cd '{app_root}' && git -c core.quotePath=false diff --relative --name-only {diff_base} {snapshot} -- ':(exclude)docs/phases') && RL_FILES=',"files":['"$(printf '%s' "$RL_FILES" | tr '\042\134' "'/" | sed 's/.*/"&"/' | paste -sd, -)"']' || RL_FILES=''
```

**2. One append per sprint**, with this exact line, replacing only the `{…}` placeholders and keeping every other character, including the summary's `tr` pipe and `"${RL_FILES:-}"`. `{path}`, `{phase}`, `{wave}`, `{attempt}` and `{max}` come from `run_log`. Every sprint in the wave gets the same `files`.

```sh
mkdir -p "$(dirname '{path}')" && printf '{"v":1,"ts":"%s","phase":%d,"wave":%d,"sprint":"%s","gate":"%s","result":"%s","attempt":%d,"max":%d,"summary":"%s"%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{phase}' '{wave}' '{sprint}' '{gate}' '{result}' '{attempt}' '{max}' "$(printf '%s' '{summary}' | tr '\042\134\011\012\015' "'/   " | tr -d '\000-\037')" "${RL_FILES:-}" >> '{path}'
```

Run it as one call: `RL_FILES=…; {append for 11.1} && {append for 11.2}`.

| `gate` | One line per | `result` | `summary` |
|--------|--------------|----------|-----------|
| `doc_sync` | sprint in the payload, ascending `id` | `pass` if its statuses were applied; `fail` if it's in `FAILURES` | `{k} tasks updated`, or the reason from `FAILURES` |

- Summaries are one line, at most 200 characters. Write a straight apostrophe as `'\''`; type everything else as-is, including `"` and `\`. Never backslash-escape a character: inside single quotes `\"` stays two characters and lands in the log as `/'`.
- Use a POSIX shell (Git Bash on Windows).
- A git error in step 1 still writes the events, without `files`; say so in `NOTES`. An append that exits non-zero gets one line in `NOTES` (`run log: append failed — {reason}`). Neither changes STATUS.

---

## Prompt template (orchestrator fills braces)

```
You are the phase doc-sync agent. Update phase plan task statuses only.

Read and follow: the phase-doc-sync skill (loaded per runtime-adapter.md)
Read and follow: the phase-planner skill (loaded per runtime-adapter.md)

PROJECT ROOT: {project_root}
APP ROOT: {app_root}
PHASE FILE: {phase_file}

PAYLOAD:
{json payload}

RULES:
- Edit ONLY the phase file task Status columns for sprints in the payload
- Batch edits — never one edit per task row
- Do not modify acceptance criteria, dependencies, or overview prose
- After editing, take the SNAPSHOT from APP ROOT (Execution step 6)
- If the payload has run_log, append the doc_sync lines last (Execution step 6b)
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
SNAPSHOT: 4b825dc642cb6eb9a060e54bf8d69288fbee4904
NOTES: none
```
