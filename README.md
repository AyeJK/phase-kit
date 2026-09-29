<p align="center">
  <img src="docs/social-preview-grid.gif" alt="Phase Runner: your whole product team, not just a coding agent. The stages Idea, Design, Plan, Build and QA light up in turn, then Sign off turns green." width="100%">
</p>

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

## Watch a build live

[`phase-viewer`](viewer/) is a local dashboard for a phase run. It shows your phases, sprints and tasks, and every gate result as it lands: which wave is building, which verify failed and why, and the retry that fixed it. It updates as the files change, and it only reads your project, never writes to it.

<!-- Recording of a live run with a verify fail and the retry landing goes here (release asset, Sprint 6.3 task 5). -->

In Claude Code, say *"open the viewer"*. The `phase-viewer` skill starts it in the background and gives you the URL. Ask again later and you get the same URL, since only one viewer runs per project.

Or, from your project folder (the one that holds `docs/phases/`), in your own terminal:

```
npx phase-viewer
```

Open the URL it prints. Ctrl+C stops it. Needs Node.js 20 or later.

**Local sessions only.** The viewer serves on `localhost` of the machine that runs it. In a cloud or remote Claude Code session, the skill starts nothing and tells you to run `npx phase-viewer` on your own machine, against your local checkout.

**Keep run logs out of git.** `phase-builder`'s agents append one JSON line per gate result, plus one as each sprint's implementation starts, to `docs/phases/.runs/`. The viewer reads these logs, but they only make sense on the machine that ran the build, so add this to your `.gitignore`:

```gitignore
docs/phases/.runs/
```

## How it compares

| | Phase Runner | [Superpowers](https://github.com/obra/superpowers) | [Spec Kit](https://github.com/github/spec-kit) | [GSD](https://github.com/open-gsd/gsd-core) | [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) |
|---|---|---|---|---|---|
| **Idea → product plan** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Design system before code** | ✅ with HTML mockups | ❌ | ❌ | ✅ UI contract + HTML sketches | ✅ UX spec |
| **Parallel build** | ✅ waves | ❌ sequential by design | — | ✅ waves | — |
| **A separate agent reviews the work** | ✅ every wave | ✅ every task | ❌ the implementer checks its own work | 🟡 on demand | 🟡 on demand |
| **Automatic retry on failure** | ✅ up to 3, then you | ✅ up to 5 rounds | 🟡 you repeat implement → converge | 🟡 on demand | — |
| **Browser QA on UI work** | ✅ every UI wave | ❌ | ❌ | 🟡 on demand, with a browser MCP | 🟡 generates E2E tests |

✅ built into the workflow · 🟡 a command you run · ❌ not included · — not documented

Most of these pieces exist somewhere. Phase Runner is the one where all of them run on their own, on every wave, inside the build loop.

<sub>Checked against each project's README and docs on Sep 27, 2026. Spot something out of date? Open an issue.</sub>

## What's in here

### Skills you use

These are the five you talk to. Everything else runs on its own.

| Skill | Job |
|---|---|
| `product-planner` | Turns a rough idea into a rich HTML plan doc — options considered, data flow, open questions. Optional first step. |
| `design-planner` | Locks a visual design system and per-screen specs *before* implementation starts. Optional, for UI-heavy projects. |
| `phase-planner` | Creates and edits `docs/phases/Phase-*.md` files — the sprint/task source of truth. |
| `phase-builder` | The orchestrator. Reads a phase file, groups sprints into parallel-safe waves, spawns implementation sub-agents, and won't advance a wave until it passes verification. |
| `phase-viewer` | Starts the live dashboard (`npx phase-viewer`) in the background and gives you its URL. Local sessions only. |

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

Two roots matter and phase-builder resolves both automatically at the start of every run (see `plugin/skills/phase-builder/project-layout.md`):

- **workspace_root** — where `docs/` lives
- **app_root** — where your code and its manifest file live

Small projects often have these be the same folder. Larger ones split them — useful when you want the phase history to survive a full rewrite of the app itself.

You don't need to create these folders. `phase-planner` and `design-planner` make them the first time they run.

## Platform support

This kit was originally built against Cursor's skill/sub-agent conventions and has been generalized to run on any Claude Code–compatible agent runtime (Cursor, Claude Code, or hosts built on the Claude Agent SDK). The only environment-specific pieces — which tool spawns a sub-agent, what type name to give it, and how skill files get loaded — are resolved once per run by `plugin/skills/phase-builder/runtime-adapter.md`, which discovers what's actually available in your session rather than assuming a specific tool. See that file if you're adding support for a new environment.

## Optional dependencies

`phase-ui-implement` and `design-planner` will use a generic UI-component-pattern skill and a frontend-design-direction skill *if you have one installed* — they're not bundled here, since good ones are often licensed separately (for example, Anthropic ships example skills like this with its own products). Nothing in this kit requires them; without one, implementation falls back to matching your project's existing components and, absent that, standard accessible-UI defaults. If you have such a skill installed under a name your environment can discover, `skill-router.md` will pick it up automatically.

## Status conventions

| Symbol | Meaning |
|---|---|
| `—` | Not started |
| `~` | In progress |
| `x` | Completed |
| `BLOCKED` | Blocked by dependency or issue |
| `MANUAL` | Yours to do: publish, install on your machine, record, anything outside the codebase |
| `CUT` | Removed from scope (row preserved for history) |
| `DEFERRED` | Pushed to a later sprint or phase |

`BLOCKED` and `MANUAL` both need you, in different ways. A `BLOCKED` task is agent work that got stuck: `phase-builder` stops and asks, and an agent finishes it once you unblock it. A `MANUAL` task never goes to an agent and never stops the run. `phase-builder` lists it at the phase checkpoint, and you mark it `x` when you've done it.

Only `phase-doc-sync` writes these during an automated run. You can obviously edit the file by hand any time outside a run, or just ask `phase-planner` to make the change conversationally.

## License

MIT — see [LICENSE](LICENSE).
