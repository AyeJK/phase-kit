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
2. Spawn **one** wave-test call per UI wave (not per sprint), and a **fresh** one each wave — never continue a previous wave's tester
3. Set `tier`: `full` on the first test of a wave, `regression` with `retest_only` on retries, `light` when the wave adds no new visual surface
4. Pass `harness_doc` and `design_sections`
5. Wait for `WAVE TEST RESULT:` before orchestrator runs doc-sync
6. On `STATUS: FAIL` — orchestrator re-spawns implementation, re-runs verify, then re-spawns wave-test until `PASS` or retry limit (default 3, then escalate to user)
7. Log only one line: `✓ Wave test — {sprint ids} ({summary})` — no browser automation or CLI run directly in the orchestrator thread

The orchestrator MUST NOT run browser automation, start dev servers, or read tool JSON descriptors during an active phase run.

**Model:** this role is mostly mechanical — drive a browser through a known checklist — and it's the most expensive gate by volume. If `runtime-adapter.md` resolved a `gate_model`, spawn with it. Otherwise use the session default.

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
  "design_sections": ["Tabs", "Menus"],
  "harness_doc": "{app_root}/docs/testing/wave-test-harness.md",
  "tier": "full | regression | light",
  "retest_only": ["failures from the previous attempt — regression tier only"],
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
| `design_sections` | Headings of `design_system_doc` that cover this wave's UI. Read only these |
| `harness_doc` | The project's test-setup notes: how to start the app, sign in as each role, which seed data to use, what not to touch. Read first |
| `tier` | How much to test — see below. Default `full` |
| `retest_only` | On a `regression` retry: the failed checks to re-run |

---

## Test tiers — match the weight to the change

| Tier | When the orchestrator picks it | Shape | Budget |
|---|---|---|---|
| **full** | First test of a new or reworked screen | Every viewport in `viewports`, every acceptance assert, design asserts, one screenshot per viewport | ~60 tool calls |
| **regression** | A retry after FAIL | `retest_only` checks, plus a smoke load of each `test_url`. Narrowest viewport and one desktop viewport only. Screenshot only what changed | ~20 tool calls |
| **light** | UI wave with no new visual surface (copy, wiring, a flag) | One viewport, DOM/HTTP asserts, screenshot only on failure | ~10 tool calls |

The budget is a guide, not a hard stop. If you're about to pass it, finish the checks that matter most and say in `NOTES` what you left untested — don't keep going. **Never re-test a check that passed in an earlier attempt unless this retry touched it.**

---

## Token discipline

Every step you take re-reads everything you've read so far, so what you pull into context costs you on every later step.

- **Design system:** grep its headings (`^#`) first, then read only the sections in `design_sections`, plus any other heading that's clearly about what you're testing. Read each section once. Never read the whole file.
- **Screenshots:** save them to disk. Only open one when a check needs your eyes on it.
- **Logs:** tail and grep dev-server and console logs. Never read a whole log.
- **Don't read other agents' transcripts.** If you're resuming after an interruption, the orchestrator tells you what state to expect.
- **Don't read source files** to find out how the app works if the harness doc answers it. Read source only to trace a specific failure.

---

## Execution steps

1. **Read `harness_doc`** if it exists. It's what makes a test cheap: how to start the app, how to sign in as each role, which seed data to use, what not to touch. If it doesn't exist, work those out, and then **create it** (see "Harness doc" below) so the next wave doesn't have to.
2. **Read assigned skills**, if any, in payload order. Follow their workflows at the depth `tier` allows.
3. **Read the `design_sections` of `design_system_doc`**, when present. Use them for the design asserts below. If the file is missing, skip this and note it in RESULT.
4. **Dev server:** check for an already-running dev server on the expected port. Start one in the background if needed, and wait for the ready URL. If the port is in use, reuse the existing server.
5. **Run the tests at the tier given**, using the assigned skills. If none are assigned, do a basic manual-style check: navigate to each `test_url`, screenshot it, check the console for errors, check the network tab for failed requests, and resize to each viewport looking for obvious layout breakage.
6. **Design asserts** (only when `design_system_doc` provided) — spot-check visible UI against **that project's own** design-system.md. Do not invent generic design rules here; every check in this step must trace back to something the project's own design-system.md actually says (colors, type scale, touch target minimums, spacing, copy voice — whatever that file specifies). If `design_system_doc` is absent, skip this step entirely rather than falling back to generic taste.
   Record failures in `DESIGN_ISSUES`; blocking drift → contribute to `STATUS: FAIL`
7. **Map results to wave sprints** — note which sprint's UI broke if identifiable
8. **If `fix_mode: true`** — apply minimal fixes, re-run failed checks, set STATUS accordingly
9. **Update `harness_doc`** if you learned something the next test would otherwise have to rediscover — a new fixture recipe, a quirk, a changed sign-in step. Keep it short; replace stale lines rather than appending.
10. End with `WAVE TEST RESULT:` block (required)

---

## Harness doc

`{app_root}/docs/testing/wave-test-harness.md`, committed with the project. A wave test that has one should spend its turns testing, not working out how to sign in. When you create one, cover only what you had to work out:

- **Start:** the dev command, port, anything to run first (codegen, cache to clear), and the ready URL
- **Sign in:** each role the product has, which seeded account plays it, and the exact mechanism (cookie name, helper script)
- **Seed data:** which records have enough data to test against, and which look usable but aren't
- **Fixtures:** how to create the states tests need (broken, importing, empty), naming (prefix them so they're easy to find), and how to clean up
- **Don't touch:** anything that reaches production or spends real quota, even from a local machine
- **Quirks:** dev-only overlays, stale caches, anything that caused a false failure

Put reusable helper scripts in the repo (e.g. `scripts/qa/`) rather than rewriting them in a scratch folder every time.

---

## Test data

- Prefix every fixture you create (`WT `) so it's easy to find and remove.
- Record the rows you change before changing them, and restore exactly those rows when you finish. Don't snapshot whole tables unless the harness doc says the data can't be rebuilt.
- If the harness doc names a reset command for the local database, you may **recommend** it in `NOTES`. Don't run it yourself: another session may be using the same database.

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
- Read the whole design system, or re-read a section you've already read
- Trigger anything the harness doc says reaches production (real imports, scheduled jobs, emails)
