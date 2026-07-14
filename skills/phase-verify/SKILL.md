---
name: phase-verify
description: "Per-wave CLI verification for phase-runner. Spawned as a sub-agent after implementation calls return — runs the project's build/typecheck/test commands and sprint acceptance grep patterns. Returns structured VERIFY RESULT. Orchestrator must never run CLI checks directly for verification."
---

# Phase Verify

Per-wave CLI verification sub-agent. **Read-only for phase plan files** — do not fix app code unless the orchestrator sets `fix_mode: true` (default `false` → report FAIL so the implementation agent fixes).

The **phase-runner orchestrator** spawns you after implementation calls in a wave return. On **data-only** waves you gate doc-sync; on **UI** waves you gate wave-test (doc-sync runs only after wave-test passes).

---

## Orchestrator contract

The orchestrator MUST:

1. Spawn **one** verify call per wave (after all implementation calls in the wave return)
2. Wait for `VERIFY RESULT:` before doc-sync (data-only) or before wave-test (UI waves)
3. On `STATUS: FAIL` — orchestrator re-spawns affected implementation sprint(s) with `FAILURES`, then re-spawns verify until `PASS` or retry limit (default 3, then escalate to user)
4. Log only one line: `✓ Verify — {sprint ids} ({summary})` — no CLI commands run directly in the orchestrator thread

The orchestrator MUST NOT run build/typecheck/test commands, or grep for acceptance, during an active phase run.

**Model (optional):** this role is mechanical — run a command, report pass/fail — a good candidate for a cheaper/faster model. If `runtime-adapter.md` resolved a `verify_doc_sync_model`, spawn this call with it. Otherwise use the session default; this is a cost optimization, never a blocker.

---

## Input payload (from orchestrator)

```json
{
  "project_root": "/path/to/app-root",
  "workspace_root": "/path/to/workspace-root",
  "phase_file": "docs/phases/Phase-5-Example-Feature.md",
  "wave_sprints": [
    { "id": "5.2", "title": "Utility Layer", "acceptance": "...", "verification_cli": "npm run check" },
    { "id": "5.3", "title": "Feature UI", "acceptance": "...", "verification_cli": "npm run check" }
  ],
  "skills_to_follow": [
    "{project convention doc for build/test, e.g. a rules file or CONTRIBUTING.md — resolved in project-layout.md}"
  ],
  "default_command": "{resolved from project-layout.md stack detection}",
  "acceptance_checks": ["grep patterns or notes from sprint acceptance criteria"],
  "fix_mode": false
}
```

| Field | Purpose |
|-------|---------|
| `project_root` | **app_root** — run all CLI commands from here |
| `workspace_root` | Coordination folder (optional context; phase file lives here) |
| `skills_to_follow` | Paths or names — read these first if the project has documented build/test conventions |
| `verification_cli` per sprint | From sprint `### Verification` `cli:` line; use strictest / union of commands when wave has multiple |
| `default_command` | Fallback when no `cli:` hints — resolved by stack detection in project-layout.md, not a fixed universal default |
| `acceptance_checks` | Optional grep/file-exists checks named in acceptance criteria |
| `fix_mode` | If `true`, apply minimal fixes and re-run; default `false` → report FAIL |

---

## Execution steps

1. **Read assigned skills/docs**, if any — follow the project's documented build/test workflow (prefer whatever the project's own scripts define; build only when needed)
2. **Resolve command** — per sprint `### Verification` `cli:`; if multiple sprints specify different commands, run all required commands in order
3. **Run CLI checks** — from **app_root** (`project_root`); capture exit code and failure output
4. **Run acceptance checks** — minimal grep / file-exists patterns from sprint acceptance when specified (not full exploratory QA)
5. **Map failures to sprints** — when stack traces or changed files suggest which sprint broke, set `AFFECTED_SPRINTS`; else `ALL`
6. **If `fix_mode: true`** — apply minimal fixes, re-run failed commands
7. End with `VERIFY RESULT:` block (required)

---

## VERIFY RESULT block (required)

```
VERIFY RESULT:
STATUS: PASS | FAIL | PARTIAL
COMMAND: {command actually run}
TESTS: 42/42 passed
FAILURES: [empty or actionable list]
AFFECTED_SPRINTS: [sprint ids, or ALL]
NOTES: [env quirks, pre-existing warnings]
```

| STATUS | Meaning |
|--------|---------|
| PASS | All required CLI checks exit 0 |
| PARTIAL | Some optional checks failed but blocking checks passed — orchestrator treats as PASS unless strict mode |
| FAIL | Blocking check failed — orchestrator must 3b-verify-retry |

---

## What you must not do

- Edit `docs/phases/*.md`
- Run browser automation / responsive / visual QA — wave-test handles that on UI waves (before doc-sync)
- Return without `VERIFY RESULT:`
- Dump long command output in the final message — summarize in `FAILURES`
