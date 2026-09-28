# Phase Runner

**Your whole product team, not just a coding agent.**

Plan → design → build → QA, with you as the PM who signs off.

Phase Runner is a set of Claude skills that takes a product from a rough idea to shipped code. It plans the work as phases and sprints, locks a design system before any code gets written, builds in parallel waves, and runs independent verification and browser QA on every wave. You approve at the checkpoints; the agents do the loop in between.

## Install

Two commands in Claude Code:

```
/plugin marketplace add AyeJK/phase-runner
/plugin install phase-runner@phase-runner
```

Skills load as `phase-runner:phase-planner`, `phase-runner:phase-builder`, and so on.

## How it works

| Stage | Skill | What you get |
|---|---|---|
| **Idea** | `product-planner` | An HTML product plan: the options considered, how the data flows, and the open questions |
| **Design** | `design-planner` | A locked design system, per-screen specs and HTML mockups, *before* implementation starts |
| **Plan** | `phase-planner` | `docs/phases/Phase-*.md` files with sprints, tasks and acceptance criteria |
| **Build** | `phase-builder` | Sprints grouped into parallel-safe waves, each built by a fresh sub-agent. UI sprints build against your design system |
| **QA** | Automatic: `phase-builder` runs `phase-verify` + `phase-wave-test` | Build, typecheck and tests, a diff review against every acceptance criterion, and browser checks against your design system |
| **Sign-off** | You | The run pauses at blockers and phase boundaries. Nothing ships past you |

A failed wave retries the same sprint with the failure attached, up to three times, then escalates to you. Only `phase-doc-sync` writes status back to the phase file, so the plan always matches what actually passed.

## Quickstart

1. **Plan the product.** Starting something new? Tell `product-planner` what you want to build. It turns the idea into a product plan: the options, how the data flows, and the open questions to settle.
2. **Design it (optional).** Run `design-planner` to lock in a design system and get HTML mockups of every screen before any code is written.
3. **Break it into phases.** Ask `phase-planner` to turn the product plan into phase plans, split into sprints and tasks, each with acceptance criteria.
4. **Build it.** With the docs in place, say something like *"implement phase 1"*. `phase-builder` gets to work, and checks in with you when it hits a blocker or finishes the phase.

## What's in here

### Skills you use

These are the four you talk to. Everything else runs on its own.

| Skill | Job |
|---|---|
| `product-planner` | Turns a rough idea into a rich HTML plan doc — options considered, data flow, open questions. Optional first step. |
| `design-planner` | Locks a visual design system and per-screen specs *before* implementation starts. Optional, for UI-heavy projects. |
| `phase-planner` | Creates and edits `docs/phases/Phase-*.md` files — the sprint/task source of truth. This is the one you'll talk to most for "mark task 3 done" or "what's left in sprint 2.1." |
| `phase-builder` | The orchestrator. Reads a phase file, groups sprints into parallel-safe waves, spawns implementation sub-agents, and won't advance a wave until it passes verification. |

### Skills phase-builder runs for you

You normally don't call these. `phase-builder` spawns each one as a sub-agent during a run, with its own narrow job and a structured result it has to hand back.

| Skill | Job |
|---|---|
| `phase-ui-implement` | Builds UI sprints. Reads your `design-system.md` first, generic UI-pattern skills second. |
| `phase-verify` | Runs your build/test/typecheck command, then reviews the wave's diff: a met/not-met verdict with evidence for every acceptance criterion, a check that no test was deleted or weakened, and a check that changes stay inside each sprint's Module column. Serious findings fail the wave and trigger a retry. |
| `phase-wave-test` | Browser and UI checks on UI sprints, against your project's `design-system.md` if one exists. |
| `phase-doc-sync` | The *only* thing allowed to write status changes back into the phase file. Batches edits, never touches acceptance criteria or task text. |

## Why sub-agents, and why the strict handoff order

The orchestrator (`phase-builder`) never writes code, never runs your test suite, and never edits the phase file directly. Every one of those actions happens in a sub-agent with a narrow, single-purpose prompt, and the orchestrator only advances after reading back a structured result block (`SPRINT RESULT`, `VERIFY RESULT`, `WAVE TEST RESULT`, `DOC SYNC RESULT`). This is deliberate:

- **The orchestrator thread stays cheap and legible.** No command output, no tool logs — just one-line status per gate. You can read what happened in a long run without wading through build logs.
- **Nothing is "done" because an agent said so.** Verify and wave-test are separate passes with their own pass/fail contract. Implementation can't grade its own homework.
- **The phase file can't drift.** Only doc-sync writes to it, and only after every gate for that wave has actually passed.
- **Retries retry the same unit of work**, not a patched-together "fix" task with no scope boundary. A failed sprint gets re-spawned with the failure injected — same sprint ID, same acceptance criteria, `(retry n)` in the description.

## The folder convention

```
your-project/
├── docs/
│   ├── phases/
│   │   ├── Phase-1-Foundation.md
│   │   ├── Phase-2-Core-Feature.md
│   │   └── ...
│   └── design/                    (optional — only if you run design-planner)
│       ├── DESIGN.md
│       ├── design-system.md
│       └── screens/
│           ├── index.html
│           └── {screen}.md + {screen}.html
└── app/                           (or wherever your actual code lives)
    ├── package.json / pyproject.toml / Cargo.toml / go.mod
    └── src/
```

Two roots matter and phase-builder resolves both automatically at the start of every run (see `skills/phase-builder/project-layout.md`):

- **workspace_root** — where `docs/` lives
- **app_root** — where your code and its manifest file live

Small projects often have these be the same folder. Larger ones split them — useful when you want the phase history to survive a full rewrite of the app itself.

You don't need to create these folders. `phase-planner` and `design-planner` make them the first time they run.

## Platform support

This kit was originally built against Cursor's skill/sub-agent conventions and has been generalized to run on any Claude Code–compatible agent runtime (Cursor, Claude Code, or hosts built on the Claude Agent SDK). The only environment-specific pieces — which tool spawns a sub-agent, what type name to give it, and how skill files get loaded — are resolved once per run by `skills/phase-builder/runtime-adapter.md`, which discovers what's actually available in your session rather than assuming a specific tool. See that file if you're adding support for a new environment.

## Optional dependencies

`phase-ui-implement` and `design-planner` will use a generic UI-component-pattern skill and a frontend-design-direction skill *if you have one installed* — they're not bundled here, since good ones are often licensed separately (for example, Anthropic ships example skills like this with its own products). Nothing in this kit requires them; without one, implementation falls back to matching your project's existing components and, absent that, standard accessible-UI defaults. If you have such a skill installed under a name your environment can discover, `skill-router.md` will pick it up automatically.

## Status conventions

| Symbol | Meaning |
|---|---|
| `—` | Not started |
| `~` | In progress |
| `x` | Completed |
| `BLOCKED` | Blocked by dependency or issue |
| `CUT` | Removed from scope (row preserved for history) |
| `DEFERRED` | Pushed to a later sprint or phase |

Only `phase-doc-sync` writes these during an automated run. You can obviously edit the file by hand any time outside a run, or just ask `phase-planner` to make the change conversationally.

## License

MIT — see [LICENSE](LICENSE).
