# phase-kit

A set of Claude skills for running software projects as phases → sprints → verified waves, with an AI orchestrator doing the implementation loop and a human doing the checkpoints.

If you've ever had an agent "finish" a feature that doesn't build, or watched a long autonomous run quietly drift off scope with no record of what actually happened, this is the fix: every unit of work is a row in a markdown table with a status, every implementation pass is gated by an automated verify step before it's allowed to count as done, and nothing gets marked complete without a machine-checked pass.

## What's in here

| Skill | Job |
|---|---|
| `product-planner` | Turns a rough idea into a rich HTML plan doc — options considered, data flow, open questions. Optional first step. |
| `design-planner` | Locks a visual design system and per-screen specs *before* implementation starts. Optional, for UI-heavy projects. |
| `phase-planner` | Creates and edits `docs/phases/Phase-*.md` files — the sprint/task source of truth. This is the one you'll talk to most for "mark task 3 done" or "what's left in sprint 2.1." |
| `phase-runner` | The orchestrator. Reads a phase file, groups sprints into parallel-safe waves, spawns implementation sub-agents, and won't advance a wave until it passes verification. |
| `phase-verify` | Sub-agent: runs your build/test/typecheck command and reports pass/fail. Never runs inline in the orchestrator thread. |
| `phase-wave-test` | Sub-agent: browser/UI verification for UI sprints, using your project's own `design-system.md` if one exists. |
| `phase-doc-sync` | Sub-agent: the *only* thing allowed to write status changes back into the phase file. Batches edits, never touches acceptance criteria or task text. |
| `phase-ui-implement` | Implementation sub-agent for UI-primary sprints — reads your design-system.md first, generic UI-pattern skills second. |

## Why sub-agents, and why the strict handoff order

The orchestrator (`phase-runner`) never writes code, never runs your test suite, and never edits the phase file directly. Every one of those actions happens in a sub-agent with a narrow, single-purpose prompt, and the orchestrator only advances after reading back a structured result block (`SPRINT RESULT`, `VERIFY RESULT`, `WAVE TEST RESULT`, `DOC SYNC RESULT`). This is deliberate:

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

Two roots matter and phase-runner resolves both automatically at the start of every run (see `skills/phase-runner/project-layout.md`):

- **workspace_root** — where `docs/` lives
- **app_root** — where your code and its manifest file live

Small projects often have these be the same folder. Larger ones split them — useful when you want the phase history to survive a full rewrite of the app itself.

Run `scaffold/init.sh [target-dir]` to lay down the `docs/phases/` and `docs/design/` structure with starter files in a new or existing project.

## Platform support

This kit was originally built against Cursor's skill/sub-agent conventions and has been generalized to run on any Claude Code–compatible agent runtime (Cursor, Claude Code, or hosts built on the Claude Agent SDK). The only environment-specific pieces — which tool spawns a sub-agent, what type name to give it, and how skill files get loaded — are resolved once per run by `skills/phase-runner/runtime-adapter.md`, which discovers what's actually available in your session rather than assuming a specific tool. See that file if you're adding support for a new environment.

## Optional dependencies

`phase-ui-implement` and `design-planner` will use a generic UI-component-pattern skill and a frontend-design-direction skill *if you have one installed* — they're not bundled here, since good ones are often licensed separately (for example, Anthropic ships example skills like this with its own products). Nothing in this kit requires them; without one, implementation falls back to matching your project's existing components and, absent that, standard accessible-UI defaults. If you have such a skill installed under a name your environment can discover, `skill-router.md` will pick it up automatically.

## Quickstart

1. `./scaffold/init.sh path/to/your/project`
2. Talk to `phase-planner` to fill in real sprints (or ask an LLM to draft a full phase plan from a spec, then have phase-planner review the format)
3. Optionally run `design-planner` first if the phase has meaningful UI surface area
4. `run phase 1` — hands off to `phase-runner`

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
