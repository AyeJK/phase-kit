---
name: phase-wave-test
description: "Per-wave browser and UI verification for phase-runner. After CLI verify, before doc-sync on UI waves. Runs dev server, assigned testing skills (if installed), and design-system.md asserts (if present). Returns WAVE TEST RESULT. Orchestrator must never run browser automation or CLI directly."
---

# Phase Wave Test

Per-wave UI and browser verification sub-agent. **Read-only for phase plan files** — you may fix app code only when the orchestrator explicitly sets `fix_mode: true` in the payload (rare; default is report-only and return FAIL so the implementation agent fixes).

The **phase-runner orchestrator** spawns you after CLI verify passes and **before** doc-sync on UI waves. You follow whatever skills the orchestrator assigns — do not assume a specific testing skill is installed; read each assigned skill file/name first, and if none are assigned, fall back to a basic manual-style check (see Step 4).

---

## Orchestrator contract

The orchestrator MUST:

1. Assign skill references in the payload (`skills_to_follow`) — only ones actually available in this environment, per skill-router.md
2. Spawn **one** wave-test call per UI wave (not per sprint)
3. Wait for `WAVE TEST RESULT:` before orchestrator runs doc-sync
4. On `STATUS: FAIL` — orchestrator re-spawns implementation, re-runs verify, then re-spawns wave-test until `PASS` or retry limit (default 3, then escalate to user)
5. Log only one line: `✓ Wave test — {sprint ids} ({summary})` — no browser automation or CLI run directly in the orchestrator thread

The orchestrator MUST NOT run browser automation, start dev servers, or read tool JSON descriptors during an active phase run.

---

## Input payload (from orchestrator)

```json
{
  "project_root": "/path/to/app-root",
  "workspace_root": "/path/to/workspace-root",
  "phase_file": "docs/phases/Phase-5-Example-Feature.md",
  "wave_sprints": [
    { "id": "5.2", "title": "Utility Layer", "ui_routes": [] },
    { "id": "5.3", "title": "Feature UI", "ui_routes": ["/settings/profile"] }
  ],
  "skills_to_follow": [
    "{any browser/visual/responsive testing skill actually available in this environment, per skill-router.md}"
  ],
  "test_urls": ["http://localhost:3000/settings/profile"],
  "viewports": [375, 428, 768, 1280, 1536],
  "acceptance_notes": "From sprint acceptance criteria — what to confirm in browser",
  "design_system_doc": "{workspace_root}/docs/design/design-system.md, only if it exists",
  "fix_mode": false
}
```

| Field | Purpose |
|-------|---------|
| `project_root` | **app_root** — dev server, build tooling, browser tests |
| `workspace_root` | Coordination folder |
| `skills_to_follow` | Paths or names — **read each one before testing**; may be empty if none installed |
| `design_system_doc` | **`{workspace_root}/docs/design/design-system.md` only**, and only when present |
| `test_urls` | Routes to open; infer from sprint tasks if omitted |
| `viewports` | Default all five from a standard responsive check if omitted |
| `fix_mode` | If `true`, fix trivial issues and re-test; default `false` → report FAIL |

---

## Execution steps

1. **Read assigned skills**, if any — in payload order; follow their workflows
2. **Read `design_system_doc`** when present — use for design asserts below (skip if file missing; note in RESULT)
3. **Dev server** — check for an already-running dev server on the expected port; start in background if needed; wait for ready URL; handle port-in-use by reusing existing server
4. **Run tests per assigned skills**, or — if none are assigned — do a basic manual-style check: navigate to each `test_url`, screenshot, check console for errors, check network tab for failed requests, resize to each viewport and look for obvious layout breakage
5. **Design asserts** (only when `design_system_doc` provided) — spot-check visible UI against **that project's own** design-system.md. Do not invent generic design rules here; every check in this step must trace back to something the project's own design-system.md actually says (colors, type scale, touch target minimums, spacing, copy voice — whatever that file specifies). If `design_system_doc` is absent, skip this step entirely rather than falling back to generic taste.
   Record failures in `DESIGN_ISSUES`; blocking drift → contribute to `STATUS: FAIL`
6. **Map results to wave sprints** — note which sprint's UI broke if identifiable
7. **If `fix_mode: true`** — apply minimal fixes, re-run failed checks, set STATUS accordingly
8. End with `WAVE TEST RESULT:` block (required)

---

## WAVE TEST RESULT block (required)

```
WAVE TEST RESULT:
STATUS: PASS | WARN | FAIL
URLS: [tested URLs]
VIEWPORTS: [375: PASS, 428: PASS, ...]
CONSOLE_ERRORS: [list or NONE]
ISSUES: [list or NONE]
DESIGN_ISSUES: [design-system.md violations or NONE — omit section if no design_system_doc was provided]
AFFECTED_SPRINTS: [sprint ids if known, or ALL]
FAILURES: [actionable list for implementation retry, or NONE]
NOTES: [pre-existing warnings, env quirks]
```

| STATUS | Meaning |
|--------|---------|
| PASS | All required checks passed |
| WARN | Minor issues (pre-existing console noise, non-blocking layout) — orchestrator logs and continues unless user asked for strict mode |
| FAIL | Blocking UI/flow/regression/design-system violation — orchestrator must retry implementation (phase-ui-implement for UI sprints) then re-run wave-test |

---

## Dev server notes

- Prefer reusing an already-running server
- If your shell doesn't support chaining commands with `&&` reliably (some Windows shells), run the dev server as its own background process instead of chaining
- Record which URL/port worked in NOTES

---

## What you must not do

- Edit `docs/phases/*.md`
- Return without `WAVE TEST RESULT:`
- Assume a specific testing skill is available if it's not in `skills_to_follow`
- Invent design rules not actually present in `design_system_doc` — no `design_system_doc`, no design asserts
- Dump long tool logs in the final message — summarize in structured block only
