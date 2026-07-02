---
name: phase-runner
description: "Orchestrates automated sprint implementation from phase plans — e.g. 'run phase 1', 'implement sprint 1.3'. Spawns phase-ui-implement (UI sprints + docs/design/design-system.md), general implementation (data/mixed), phase-verify, phase-wave-test (design asserts), phase-doc-sync. Skill-router per sprint. Clean orchestrator thread. Max 3 retries per gate then escalate. Pauses at blockers and phase boundaries."
---

# Phase Runner

Orchestrates sprint implementation from phase plan files at `docs/phases/Phase-{N}-*.md`. Reads the plan, identifies incomplete sprints, **groups sprints into parallel waves when safe**, spawns one sub-agent per sprint (multiple sub-agent calls in the same turn when running a wave), processes results, and manages human checkpoints at blockers and phase boundaries. **Default remains sequential** when the dependency graph, overlap risk, or sprint semantics do not justify parallelism.

**Companion files:** `runtime-adapter.md` (which sub-agent tool and skill-loading mechanism this environment uses), `project-layout.md` (workspace_root vs app_root), `skill-router.md`, and the `phase-ui-implement`, `phase-verify`, `phase-wave-test`, `phase-doc-sync` skills.

---

## Step 0 — Resolve the runtime

Read **`runtime-adapter.md`** first, before anything else. It tells you which tool spawns sub-agents in this session, what subagent type to use, and how to load the other phase-kit skills (by name or by path). Every "spawn a Task" and "read skill X" instruction below assumes you've already done this — substitute the resolved tool/type/loading-mechanism throughout.

---

## Step 1 — Clarify Scope and Inventory Tools

Before doing anything else:

**Confirm scope:**
1. **Which phase(s)?** — e.g. "Phase 1", "phases 1 and 2", "phase 3 from sprint 3.2 onwards"
2. **Starting sprint** — default is the first incomplete sprint in the target phase

If the user said "run phase 1", that means: start from the first incomplete sprint in Phase 1, run all sprints in that phase **using parallel waves where Step 2.5 allows**, otherwise in sprint order, then pause before Phase 2.

### Resolve project layout (required)

Read **`project-layout.md`** and resolve:

- **`workspace_root`** — where `docs/phases/` lives; doc-sync and design-system paths
- **`app_root`** — where the stack manifest and `src/` live; CLI checks, dev server, implementation

Store both absolute paths for the entire run. Report in the execution plan (see project-layout.md).

If ambiguous (multiple candidate app roots), ask once — do not guess per sprint.

**Do not** conflate workspace_root and app_root in sub-agent prompts.

**Inventory available tools:**

Scan what MCP tools and plugins are currently connected. Look for tools relevant to this project's stack — e.g. hosting/database/deployment platforms, version control. Build a short list:

```
Available integrations:
  ✓ {database platform} — migrations, table management
  ✓ {deploy platform} — deployment, environment variables
  ✗ {version control} — not connected
```

This list gets injected into every sub-agent prompt so the sub-agent knows what it can use.

**Check for required tools:**

The sub-agent will use MCP tools where connected and CLI tools where not — both are valid. Only pause here if you can identify something the sprints will need that has no CLI fallback either (e.g. a credentials-based service with no local tooling at all). In that case:

```
⚠ Sprint {X.Y} will need {tool} and nothing equivalent appears to be available.

Options:
  1. Connect it now — I'll help you find an MCP connector or CLI path for "{tool}"
  2. Proceed anyway — the sub-agent will flag what it can't do
  3. Stop here

What would you like to do?
```

If the user wants to connect it: check your environment's MCP/connector settings, search the web for an official or community connector for that service, or point them to wherever your environment manages integrations. There is no single guaranteed "registry" tool in every session — adapt to what the executor agent can actually call.

---

## Step 1.5 — Skill routing (best skill per step)

Read **`skill-router.md`** at Step 1.5 (it in turn depends on `runtime-adapter.md` and `project-layout.md` already being resolved).

1. **Scan** available skill names + descriptions per skill-router.md's discovery method.
2. **Honor user-requested skills** from the run request — testing skills → wave-test; UI skills → implementation for UI sprints.
3. **Per sprint:** set `implementation_agent: ui | general`; build `implementation_skills[]`; set `design_system_doc` to `{workspace_root}/docs/design/design-system.md` when sprint is UI or mixed **and that file exists**.
4. **Per wave:** mark `wave_has_ui: true|false`; build `verify_skills[]`; build `wave_test_skills[]` when UI.
5. **Include skill plan** in the execution plan report (Step 2.5).

Sub-agents load their own assigned skill files/names themselves — orchestrator only passes the resolved references (paths or names, per runtime-adapter) in prompts, never runs those workflows inline.

---

## Orchestrator thread — keep clean

During an active phase run the orchestrator may only:

- Read phase files, skill-router, phase-doc-sync payload shape
- Spawn sub-agents (implementation, verify, doc-sync, wave-test)
- Parse `SPRINT RESULT`, `VERIFY RESULT`, `DOC SYNC RESULT`, `WAVE TEST RESULT`
- One-line logs to the user

The orchestrator must **not**: run shell commands directly, call browser/automation tools directly, start dev servers, read tool JSON descriptors, or run grep/typecheck for verification. All of that lives in sub-agents.

---

## Retry limits and escalation

Track retry counts **per wave** (reset when a new wave starts, or when the user chooses **continue retrying** after escalation).

| Gate | Default max | Count when |
|------|-------------|------------|
| **3b-verify-retry** | **3** | Each `VERIFY RESULT: FAIL` after re-implement + re-verify cycle |
| **3f-retry** | **3** | Each `WAVE TEST RESULT: FAIL` after full retry cycle |

User may override at run start: e.g. `max retries 5` or `strict — no retry limit` (honor explicit instruction).

**When a counter reaches max**, stop the retry loop and surface:

```
⚠ {Verify | Wave test} retry limit reached ({max}/{max}) — Sprint(s) {ids}

Last failures:
{FAILURES / ISSUES from most recent result block}

Retry history:
  Attempt 1: {one-line summary}
  Attempt 2: ...
  Attempt 3: ...

Options:
  1. Continue retrying — resets counter for this gate; re-spawn from last failure
  2. Skip this gate — advance without passing (doc-sync only if user confirms; warn phase file may be stale)
  3. Stop here — report wave state and exit phase run

What would you like to do?
```

Do **not** silently retry beyond max. Wait for user response before option 1 or 2.

Log each retry: `↻ Verify — 5.3 (retry 2/3)` or `↻ Wave test — 5.3 (retry 2/3)`.

---

## Wave sequencing (mandatory)

**One wave must fully finish before the next wave starts.** Gates inside a wave are **strictly sequential** except: multiple **implementation** sub-agent calls in the same turn when a wave has 2+ sprints (3b only).

### Allowed parallelism

| Same turn | Allowed? |
|-----------|----------|
| Multiple **3b** implementation calls (multi-sprint wave only) | ✓ |
| Verify + wave-test | ✗ |
| Wave-test + doc-sync | ✗ |
| Verify + doc-sync | ✗ |
| Doc-sync + next wave implementation | ✗ |
| Verify + next wave anything | ✗ |
| Wave-test + next wave anything | ✗ |
| Doc-sync + anything else | ✗ — wait for `DOC SYNC RESULT` first |

### Order within one wave

**Data-only:** 3b → 3b-verify → (retry loop) → 3c → 3c-sync → 3d → 3e

**UI:** 3b → 3b-verify → (retry loop) → 3c → 3f → (retry loop) → 3c-sync → 3d → 3e

Each arrow = wait for the prior step's result block before spawning the next sub-agent.

### Advance rule

**3e — Advance to next wave** only after:

1. All gates passed (or user skipped via escalation), **and**
2. **3c-sync** returned `DOC SYNC RESULT: SUCCESS`

Never pipeline Sprint N+1 while Wave N doc-sync is in flight or incomplete.

---

## Retry implementation only (no Fix tasks)

On verify or wave-test **FAIL**, the **only** code-change path is re-spawn the **same sprint** implementation sub-agent (3a-ui or 3a-general) with failures injected — not a separate fix agent.

### Forbidden during phase runs

| Forbidden | Why |
|-----------|-----|
| A task description like `Fix 6.4`, `Fix TS error`, `Fix tracker` | Bypasses sprint scope and SPRINT RESULT contract |
| A dedicated "fixer" sub-agent for code fixes | doc-sync's dedicated agent (if one exists) is **doc-sync only** during phase runs |
| Spawning a new sprint while retrying the current wave | Violates wave sequencing |
| Implementation running CLI checks on retry | phase-verify owns CLI checks |

### Required retry shape

- **Description:** `Sprint {X.Y} — {title} (retry {n})` — same sprint id every time
- **Prompt:** full 3a-ui or 3a-general template + `PRIOR VERIFY / WAVE TEST FAILURES` block from last `VERIFY RESULT` or `WAVE TEST RESULT`
- **Type:** the general-purpose type resolved in runtime-adapter.md

After implementation returns → **3b-verify** again → (UI) **3f** again. Never skip verify to save time.

---

## Step 2 — Read and Parse the Phase File

Read the target phase file. Sprints are identified by this header pattern:
```
# Sprint {N}.{M} — {Title}
```

Each sprint section contains:
- **Goal** line
- **Tasks** table (with Status column: `—` not started, `~` in progress, `x` done, `BLOCKED`, `CUT`, `DEFERRED`)
- **Acceptance Criteria** section
- **Dependencies** section

**A sprint is complete** when all tasks with status `—`, `~`, or `BLOCKED` are gone — i.e. every task is `x`, `CUT`, or `DEFERRED`. Skip complete sprints silently.

Build an ordered list of sprints to run. Report it to the user before starting:

```
Phase {N} — {Title}
Sprints to run: {X.1}, {X.2}, {X.3}
(Skipping: {X.0} — already complete)

Starting with Sprint {X.1}...
```

---

## Step 2.5 — Parallelization (waves, not forced)

After you have the **ordered list of incomplete sprints**, decide whether to run **waves** (multiple sprints at once) or **strictly one sprint at a time**.

### When parallel waves make sense

- **Dependencies satisfied:** For each sprint in a proposed wave, its **Dependencies** section (and common sense from goals/tasks) must not require **deliverables** from another sprint in the *same* wave that is not yet complete. Prior sprints in the file or already-completed sprints can satisfy deps.
- **Low merge conflict risk:** Sprints should touch **disjoint or weakly overlapping** areas (different packages, different features, different tables) when possible. If two sprints would obviously edit the same few files or the same migration chain in conflicting ways, **do not** put them in one wave.
- **Doc-sync after the wave:** Implementation sub-agents must **not** edit `docs/phases/*.md`. After the wave finishes, the orchestrator spawns **one phase-doc-sync sub-agent** (see Step 3c) to apply all `SPRINT RESULT` status updates in sprint order. That avoids parallel writers on the plan file and keeps the orchestrator thread free of per-row doc edits.

### When to stay sequential (single sprint per iteration)

- Explicit or implied **ordering**: e.g. "depends on Sprint X.Y", schema before code that imports it, foundational sprint before consumers.
- **Tight coupling** or unknown overlap — prefer sequential unless deps are clearly independent.
- **User asked for a single sprint** or a **narrow range** — usually one call.
- **Capacity / risk:** Very large sprints, flaky tooling, or first time on a phase — sequential is fine.

### Wave construction

1. Take the next contiguous set of incomplete sprints from your ordered list (or the user's requested subset).
2. Build a **dependency graph** from each sprint's Dependencies section + titles/goals (treat missing deps as "depends on prior sprint in file order" only if the prose clearly implies it).
3. Partition into **waves**: Wave 1 contains sprints whose deps are all met by completed sprints or external facts; Wave 2 is computed after Wave 1 would be done; etc. Within a wave, **all** sprints must be pairwise safe per the rules above.
4. If the only valid partition is one sprint per wave, **run sequentially** — no artificial parallelism.

**Report to the user** before spawning (adjust wording if a single sprint):

```
Execution plan:
  Wave 1 (parallel): {X.1}, {X.2}
  Wave 2 (sequential): {X.3}  — depends on schema from {X.1}
  Wave 3 (parallel): {X.4}, {X.5}
```

If everything is sequential:

```
Execution plan: sequential — {X.1} → {X.2} → {X.3} (parallelism not safe / not justified).
```

Append **skill plan** from Step 1.5 (implementation skills per sprint, wave-test skip/run per wave).

---

## Step 3 — The Sprint Loop (waves or single)

### Per wave (one or many sprints)

For each **wave** from Step 2.5:

#### If the wave has one sprint

**Data-only wave** (`wave_has_ui: false`):

Follow **3a → 3b → 3b-verify → 3b-verify-retry → 3c → 3c-sync → 3d → 3e**.

**UI wave** (`wave_has_ui: true`):

Follow **3a → 3b → 3b-verify → 3b-verify-retry → 3c → 3f → 3f-retry → 3c-sync → 3d → 3e**.

Doc-sync runs **after wave-test passes** on UI waves so the phase file reflects fully verified work.

#### If the wave has multiple sprints

1. Build the **3a** or **3a-ui** prompt **separately** for each sprint (see skill-router `implementation_agent`).
2. **3b — Spawn implementation sub-agents:** For a **multi-sprint wave only**, issue multiple sub-agent calls **in the same turn** (one per sprint). For a **single-sprint wave**, one call. Wait until **every** implementation call in **this wave** returns before **any** verify call. UI-primary sprints: prompt reads `phase-ui-implement`'s skill and `{workspace_root}/docs/design/design-system.md`. **Description:** `Sprint 5.3 — UI frequency form` or `Sprint 5.2 — cadence utils`.
3. **3b-verify** — spawn **one** verify call; **wait** for `VERIFY RESULT:` before 3c or 3f.
4. **3b-verify-retry** — on FAIL, re-spawn **same sprint** implementation (see Retry implementation only); then 3b-verify again. **Do not** spawn 3f, doc-sync, or next wave until verify PASS.
5. **3c — Parse results** — build doc-sync payload; hold until UI gates complete.
6. **3f — Wave test** (if `wave_has_ui`) — spawn **one** call; **wait** for `WAVE TEST RESULT:` before doc-sync.
7. **3f-retry** — on FAIL, same-sprint re-implement → 3b-verify-retry → 3f again. **Do not** doc-sync until wave-test PASS/WARN.
8. **3c-sync** — spawn **one** doc-sync call; **wait** for `DOC SYNC RESULT: SUCCESS` before 3e or next wave.
9. **3d — Blockers**
10. **3e — Advance** — next wave starts **only** after step 8 succeeds.

### 3a. Build the sub-agent prompt

For each sprint, the sub-agent starts cold. Read project convention files (whatever your project uses to document conventions — e.g. a rules folder, a CONTRIBUTING.md, or CLAUDE.md), the phase file, and **`skill-router.md`** for this sprint's `implementation_agent` and `implementation_skills[]`.

**Design system (UI work only):** inject absolute path to **`docs/design/design-system.md`** only — never the whole `docs/design/` folder — and only if the file exists.

#### 3a-ui — UI-primary sprint (`implementation_agent: ui`)

Prompt must include:

```
Read and follow FIRST:
  {absolute path or skill name for docs/design/design-system.md, if it exists}
  {phase-ui-implement skill, loaded per runtime-adapter.md}

SKILLS TO READ (after design system):
{any optional UI-pattern skill available, plus any user-requested skills}
```

Use the template below with role line: `You are a UI implementation agent for a project phase sprint.`

#### 3a-general — Data or mixed sprint (`implementation_agent: general`)

Use the template below with role line: `You are a software development agent.`

If mixed sprint touches UI files, add to prompt:

```
DESIGN SYSTEM (for UI tasks in this sprint only):
{absolute path or skill name for docs/design/design-system.md, if it exists} — read before editing UI/component files
```

Then construct the prompt using this template:

```
You are a {UI implementation | software development} agent. Your job is to implement a specific sprint from a project phase plan.

WORKSPACE_ROOT: {absolute path — docs/phases, doc-sync target}
APP_ROOT: {absolute path — run checks/dev from here; edit src/ here}
PHASE FILE: {absolute path to phase file under workspace_root}

PROJECT CONVENTIONS:
{Point at whatever convention docs this project uses — list paths, don't paraphrase; sub-agent reads them itself}

{For 3a-ui only:}
DESIGN SYSTEM (read first — overrides generic UI skills, if it exists):
{absolute path or skill name: workspace_root/docs/design/design-system.md}

AGENT SKILL:
{phase-ui-implement, loaded per runtime-adapter.md} — read and follow

SKILLS TO READ AND FOLLOW:
{references from skill-router — any optional UI-pattern skill for UI; domain skills for general}
Read each one before coding. Project design-system.md wins on conflict with any generic UI skill.

AVAILABLE INTEGRATIONS:
{tool inventory from Step 1 — list of connected MCP tools and what they do}

TOOL USAGE POLICY:
- Prefer connected MCP tools when available — they're more reliable and integrated.
  e.g. use a database MCP for migrations if connected, otherwise use that database's CLI.
  e.g. use a deploy-platform MCP for deploys if connected, otherwise use its CLI.
  e.g. use a version-control MCP for PRs if connected, otherwise use the CLI or git directly.
  e.g. use an end-to-end testing CLI (if the project has one) when the sprint needs browser-level verification — prefer it over ad-hoc manual click paths for repeatable checks.
- If an MCP tool is available, use it. If not, fall back to the CLI equivalent.
- Only mark a task BLOCKED if neither the MCP tool nor any CLI/code alternative can accomplish it.
  In that case, use reason "No tool available: {what's needed}" so the orchestrator can prompt
  the user to install something.
- Do NOT run CLI checks (build, typecheck, tests) here — **phase-verify sub-agent** runs those after you return.
- Do NOT run browser automation / responsive / visual QA here — wave-test sub-agent handles that before doc-sync on UI waves.

FULL PHASE PLAN (for context):
{full content of the phase file}

---

YOUR TASK: Implement Sprint {X.Y} — {Sprint Title}

Goal: {sprint goal line}

Tasks to implement (implement ALL of these unless a task is genuinely impossible):
{task table rows — include only tasks with status —, ~, or BLOCKED}

Acceptance Criteria:
{acceptance criteria section}

Dependencies:
{dependencies section}

{If retry: PRIOR VERIFY / WAVE TEST FAILURES — fix these before returning:
{failures from prior run}
}

---

INSTRUCTIONS:

Work through the tasks systematically. For each task:
- Implement it fully
- Use MCP tools where available — see TOOL USAGE POLICY above
- If a task requires something only a human can provide (missing credentials, an irreversible
  external action, an architectural decision that changes the project's direction), mark it
  BLOCKED and explain clearly — do not guess or make assumptions
- If a required integration is missing, mark the task BLOCKED with "Tool not connected: {name}"
  rather than improvising a workaround

Do NOT run build/typecheck/test commands — a separate verify sub-agent runs CLI checks after you return.

Do NOT edit `docs/phases/*.md` or any phase plan files — status updates are handled by doc-sync after all verification passes (CLI verify; plus wave-test on UI waves).

When you are done, your final message MUST end with this exact structured block:

SPRINT RESULT:
COMPLETED: [comma-separated task numbers, or NONE]
BLOCKED: [comma-separated task numbers, or NONE]
BLOCKED_REASONS: [for each blocked task on a new line: "Task N: <reason>"]
NOTES: [anything important — decisions made, warnings, things the next sprint should know]
```

### 3b. Spawn the implementation sub-agent(s)

The **executor** (the agent running this skill) must invoke the sub-agent tool resolved in `runtime-adapter.md`.

- **One sprint in the wave:** one call — pass the full prompt from 3a as the prompt.
- **Multiple sprints in the wave:** one call **per sprint**, same turn (see Step 3 "If the wave has multiple sprints"); each call uses that sprint's 3a prompt and a distinct **description** (e.g. `Sprint 1.2 — Schema migrations`).

For every call:

- Set the **type** to the general-purpose type resolved in runtime-adapter.md for all implementation (UI agent is prompt-driven via the `phase-ui-implement` skill).
- Set **description:** `Sprint {X.Y} — UI {short title}` or `Sprint {X.Y} — {short title}`; on retry append `(retry {n})` — **never** `Fix {X.Y}`.
- **Never** spawn implementation for wave N+1 in the same turn as doc-sync, verify, or wave-test for wave N.

Sub-agents start without the parent chat history; the injected prompt is what carries context — keep it complete.

**Limits:** Parallelism is **only** multiple 3b calls within one multi-sprint wave. All gates (verify → wave-test → doc-sync) and cross-wave work are **strictly sequential** (see Wave sequencing).

### 3b-verify. CLI verify sub-agent (orchestrator — no inline commands)

After **every** implementation call in the wave returns (with valid `SPRINT RESULT` or on retry after prior verify fail):

Spawn **exactly one** verify call:

- **description:** `Verify — {sprint ids}` e.g. `Verify — 5.2, 5.3`
- **prompt:** load the `phase-verify` skill per runtime-adapter.md; JSON payload with `project_root` = **app_root**, `workspace_root`, `wave_sprints`, `skills_to_follow` (project convention docs relevant to build/test, from project-layout.md), `default_command`, `acceptance_checks`

Wait for `VERIFY RESULT:` **before spawning 3f or 3c-sync or any call for the next wave**.

| VERIFY STATUS | Orchestrator action |
|---------------|---------------------|
| PASS | `✓ Verify — {ids} ({summary})` → 3c (UI waves: then 3f before doc-sync) |
| PARTIAL | Log NOTES → 3c (unless strict mode → 3b-verify-retry) |
| FAIL | **3b-verify-retry** — do not doc-sync or wave-test |

**Missing `SPRINT RESULT`:** Re-spawn implementation first; do not verify until a result block exists.

### 3b-verify-retry. CLI verify gate (fix until pass)

On `VERIFY RESULT: STATUS: FAIL`:

1. Increment `verify_retry_count` for this wave (start at 0 when wave begins).
2. If `verify_retry_count >= max_verify_retries` (default **3**) → **escalate** (see Retry limits); do not retry until user responds.
3. Parse `AFFECTED_SPRINTS`, `FAILURES`
4. Re-spawn **same sprint** implementation — **3a-ui** or **3a-general** with `PRIOR VERIFY / WAVE TEST FAILURES` (description `Sprint {X.Y} — … (retry {n})`). **No fix-only sub-agents.**
5. Wait for `SPRINT RESULT:` → re-spawn **3b-verify** only (one call this turn)
6. Repeat until `PASS`, user says stop/skip, or escalation

Orchestrator logs: `↻ Verify — 5.3 (retry {n}/{max})`.

**Do not doc-sync or wave-test** until verify returns `PASS` (unless user explicitly skips via escalation option 2).

### 3c. Parse implementation results (orchestrator — no phase file edits)

For **each** implementation sub-agent final message in the wave:

1. Extract `SPRINT RESULT:` — require prior `VERIFY RESULT: PASS` before doc-sync payload is used
2. Parse `COMPLETED`, `BLOCKED`, `BLOCKED_REASONS`, `NOTES` into the phase-doc-sync payload (one object per sprint, ascending `id`)
3. Do **not** edit the phase file in this step
4. **Hold payload** on UI waves until **3f** passes — spawn **3c-sync** only after wave-test PASS/WARN

Load the `phase-doc-sync` skill for payload shape and `DOC SYNC RESULT` handling.

### 3c-sync. Spawn doc-sync sub-agent (required after every wave)

Spawn **exactly one** doc-sync call when:

| Wave type | Spawn doc-sync when |
|-----------|---------------------|
| **Data-only** | `VERIFY RESULT: PASS` (after 3c) |
| **UI** | `WAVE TEST RESULT: PASS` or `WARN` (after 3f; never before wave-test) |

**Do not doc-sync** on UI waves after CLI verify alone — wait for wave-test.

- **type:** the doc-sync-dedicated type if runtime-adapter.md resolved one, otherwise the same general-purpose type
- **description:** `Doc sync — {sprint ids}` e.g. `Doc sync — 11.1` or `Doc sync — 11.2, 11.4`
- **prompt:** phase-doc-sync template; `project_root` = **workspace_root**; `phase_file` relative to workspace_root; full JSON payload

Wait for `DOC SYNC RESULT:` **before 3e or before spawning any call for the next wave**.

| DOC SYNC STATUS | Orchestrator action |
|-----------------|---------------------|
| SUCCESS | One-line log per sprint; **then** 3d → 3e — next wave may start **in a new turn** |
| PARTIAL / FAILED | Stop; show FAILURES and NOTES; offer retry doc-sync or manual fix |

**Orchestrator rule:** Never directly edit `docs/phases/*.md` during an active phase run. All status column updates go through doc-sync.

When the user skips a blocked task and says defer/cut, add `user_overrides` to the next doc-sync payload before spawning.

### 3f. Wave test sub-agent (per wave, when UI)

After **3c** (verify passed) and **before doc-sync**, if **`wave_has_ui`**:

Spawn **exactly one** wave-test call:

- **description:** `Wave test — {sprint ids}` e.g. `Wave test — 5.2, 5.3`
- **prompt:** load the `phase-wave-test` skill per runtime-adapter.md; JSON with `project_root` = **app_root**, `workspace_root`, `design_system_doc` = `{workspace_root}/docs/design/design-system.md` (if it exists), `wave_sprints`, `skills_to_follow`, `test_urls`, `acceptance_notes`

Wait for `WAVE TEST RESULT:` **before 3c-sync** — never batch with verify or doc-sync in the same turn.

| WAVE TEST STATUS | Orchestrator action |
|------------------|---------------------|
| PASS | `✓ Wave test — {ids} (PASS)` → **3c-sync** → 3d |
| WARN | Log warnings → **3c-sync** → 3d (unless strict mode → treat as FAIL) |
| FAIL | **3f-retry** — do not doc-sync or advance wave |

**Skip 3f** when `wave_has_ui: false` (data-only wave) — go straight to **3c-sync** after verify.

### 3f-retry. UI verify gate (fix until pass)

On `WAVE TEST RESULT: STATUS: FAIL`:

1. Increment `wave_test_retry_count` for this wave (start at 0 when wave begins).
2. If `wave_test_retry_count >= max_wave_test_retries` (default **3**) → **escalate** (see Retry limits); do not retry until user responds.
3. Parse `AFFECTED_SPRINTS`, `FAILURES`, `ISSUES`, `DESIGN_ISSUES`
4. Re-spawn **same sprint** implementation (3a-ui / 3a-general, `(retry {n})`, failures injected). **No fix-only sub-agents.**
5. Wait for `SPRINT RESULT:` → **3b-verify** (wait for PASS)
6. Re-spawn **3f** only — **do not doc-sync** until wave-test PASS/WARN
7. Repeat until `PASS`/`WARN`, user says stop/skip, or escalation

Orchestrator logs: `↻ Wave test — 5.3 (retry {n}/{max})`.

### 3d. Check for blockers

If any tasks are BLOCKED (in any sprint of the current wave), **stop before the next wave** and report. For a parallel wave, list **which sprint** each blocker belongs to. Handle two categories differently:

**"No tool available" blockers** — surface these with an install path:

```
⚠ Sprint {X.Y} — {Title} hit a blocker: no tool available.

  Task {N}: {description}
  Requires: {what's needed} — no MCP or CLI equivalent found

Options:
  1. Connect it now — I'll help locate an MCP server or install docs for "{tool name}"
  2. Skip this task and continue
  3. Stop here

What would you like to do?
```

If the user chooses option 1: same as Step 1 — connector discovery via your environment's integration settings or web search; then have them enable it and re-run the sprint.

**All other blockers** — surface with context:

```
⚠ Sprint {X.Y} — {Title} hit a blocker.

Blocked task(s):
{for each blocked task}
  Task {N}: {description}
  Reason: {reason from sub-agent}

Options:
  1. Resolve the blocker and re-run sprint {X.Y}
  2. Skip the blocked task(s) and continue to sprint {X.Y+1}
  3. Stop here

What would you like to do?
```

Do not proceed until the user responds. If they resolve it, re-run the implementation sub-agent for that sprint. If they skip, add `user_overrides` to the doc-sync payload (`DEFERRED` or `CUT`) and spawn doc-sync — still no orchestrator edits to the phase file.

### 3e. Advance

If no blockers, log completion and move to the **next sprint or next wave**:

```
✓ Sprint {X.Y} complete. ({N} tasks)
✓ Verify — {ids} (PASS)
✓ Wave test — {ids} (PASS)   ← UI waves, before doc-sync
✓ Doc sync — {ids}           ← after all gates pass
```

For a multi-sprint wave, log verify → wave-test (if UI) → doc-sync → one line per sprint. **Start the next wave only after doc-sync SUCCESS** — never in the same assistant turn as doc-sync.

---

## Step 4 — Phase Boundary Checkpoint

After all sprints in the current phase are done (or you've reached the end of what was requested), **always pause** — never auto-advance to the next phase.

**Before generating the checkpoint message:**
- Re-read the completed phase file to get accurate sprint titles and task counts. Do not rely on memory — invent nothing.
- Read the next phase file to list what's ahead.

Report:
```
Phase {N} — {Title} complete.

Sprints run:
  ✓ Sprint {X.1} — {exact title from phase file} ({N} tasks)
  ✓ Sprint {X.2} — {exact title from phase file} ({N} tasks)
  ...
{if any blockers were hit}
  ⚠ Sprint {X.Y} — {Title} has {N} blocked task(s) remaining

---

Next: Phase {N+1} — {Title}
Sprints ahead: {X+1.1}, {X+1.2}, ...
First sprint goal: {goal of first sprint in next phase}

Ready to begin Phase {N+1}? (yes / no / not yet)
```

Only continue if the user explicitly confirms.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Phase file not found | Tell user the expected path, ask to confirm correct location |
| Sub-agent returns no SPRINT RESULT block | Re-spawn implementation; do not verify or doc-sync until result exists |
| Verify returns FAIL | 3b-verify-retry; escalate at max (default 3) — no doc-sync until pass |
| Verify retry limit reached | Escalate with failure summary; wait for user (continue / skip gate / stop) |
| Wave test returns FAIL | 3f-retry loop — re-implement, re-verify, re-test; no doc-sync until wave-test pass |
| Wave test retry limit reached | Escalate with failure summary; wait for user |
| Doc-sync returns FAILED / PARTIAL | Do not advance wave; show FAILURES; retry doc-sync or fix phase file manually |
| Orchestrator tempted to edit phase file directly | Don't — spawn doc-sync instead |
| Orchestrator tempted to run a CLI check directly | Don't — spawn phase-verify instead |
| Orchestrator tempted to run browser/QA tools directly | Don't — spawn wave-test instead |
| Sub-agent times out or errors | Report it, offer to retry or skip; if part of a parallel wave, collect sibling outcomes then decide whether to retry failed sprint(s) alone or shrink the wave |
| Git merge conflicts after parallel wave | Sign overlap was underestimated — resolve manually or re-run affected sprints sequentially with clearer ownership |
| All sprints in phase already complete | Report "Phase {N} is fully complete — nothing to run" |
| User says "stop" at any point | Stop immediately, report where you left off |
| Sub-agent blocked on "no tool available" | Surface install path: connector discovery, CLI install, or your environment's integration settings |
| Tool connected mid-run | Re-inject updated tool inventory into next sub-agent prompt |
| User requests a specific skill mid-run | Add to skill-router plan per skill-router.md override rules |
| Orchestrator batches doc-sync + next sprint | Stop — wait for DOC SYNC SUCCESS; spawn next wave in **next turn** only |
| Orchestrator batches verify + wave-test + doc-sync | Stop — one gate per turn; see Wave sequencing |
| Orchestrator spawns a "Fix {sprint}" or fixer sub-agent for code | Stop — use same-sprint re-implement `(retry n)` per Retry implementation only |
| workspace_root vs app_root unclear | Resolve via project-layout.md at Step 1; never guess per sprint |

---

## Phase File Locations

Phase files live at `docs/phases/Phase-{N}-{Name}.md`, one per phase, numbered sequentially. Example naming for a hypothetical project:

```
docs/phases/Phase-1-Foundation-and-Schema.md
docs/phases/Phase-2-Core-Feature.md
docs/phases/Phase-3-Integrations.md
...
```

The exact number of phases and their names are entirely project-specific — phase-planner creates these as the project is scoped. Nothing about phase-runner assumes a fixed count or fixed names.

---

## Example Run

```
User: "Implement phase 5 with responsive-testing"

[Step 0: runtime resolved — Task tool, general-purpose type, skills loaded by path]
[Step 1: project layout]
  workspace_root: …/my-project           — docs/phases, doc-sync
  app_root:       …/my-project/app       — build/test, src/

[Step 1.5: skill-router …]

[Turn 1 — Wave 5.1 only]
[Sub-agent: Sprint 5.1 → SPRINT RESULT]
[Turn 2]
[Sub-agent: Verify — 5.1 → VERIFY RESULT: PASS]
[Turn 3]
[Sub-agent: Doc sync — 5.1 → DOC SYNC RESULT: SUCCESS]
✓ Sprint 5.1 complete

[Turn 4 — Wave 5.2+5.3; parallel 3b only]
[Sub-agent + Sub-agent: Sprint 5.2 + 5.3 → SPRINT RESULT]
[Turn 5]
[Sub-agent: Verify — 5.2, 5.3 → PASS]
[Turn 6]
[Sub-agent: Wave test — 5.2, 5.3 → PASS]
[Turn 7]
[Sub-agent: Doc sync — 5.2, 5.3 → SUCCESS]

[On verify FAIL — no Fix task]
[Turn N]   [Sub-agent: Sprint 5.3 — UI frequency (retry 1) → SPRINT RESULT]
[Turn N+1] [Sub-agent: Verify — 5.3 → PASS]
…

[Forbidden: Doc sync 5.1 + Sprint 5.2 same turn]
[Forbidden: Verify 5.9 + Wave test 5.9 + Doc sync 5.9 same turn]
[Forbidden: Sub-agent "Fix 5.4 titration test"]
```
