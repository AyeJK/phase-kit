# Runtime Adapter

Resolved **once**, at Step 1, alongside `project-layout.md`. Cache the result for the entire run — never re-resolve per sprint.

This file exists because the phase-kit skills spawn sub-agents and read companion skill files, and the mechanics for both differ by coding agent (Cursor, Claude Code, other Claude Code-compatible tools). Rather than hardcoding one tool's conventions, resolve them by **discovery** — inspect what's actually available in the current session instead of assuming.

Guessing wrong here is worse than asking once. Do the discovery.

---

## 1. Resolve the sub-agent spawn tool

Look at your available tool list for a tool that spawns an independent sub-agent with its own context window (as opposed to a shell/exec tool). This is commonly named `Task` or `Agent`. Use whichever is present.

Record: `subagent_tool_name` (e.g. `Task`, `Agent`).

If more than one qualifies, prefer the one whose description mentions delegating multi-step work or spawning specialized agents over one that just runs a single command.

If none exists, phase-runner cannot orchestrate sub-agents — report this to the user immediately rather than proceeding. (You can still run phase-planner, design-planner, and product-planner standalone; those don't require sub-agent spawning.)

## 2. Resolve valid sub-agent type names

Do not assume a specific custom type (e.g. `technician`) exists. Check what's actually offered:

- If the spawn tool's schema or description lists specific subagent types, use the most general-purpose one available (commonly `general-purpose`, `generalPurpose`, or unnamed/default) for implementation, verify, wave-test, and doc-sync Tasks.
- If your environment supports custom-defined sub-agents (e.g. Claude Code project agents under `.claude/agents/*.md`), and the project defines a `doc-sync` or `technician`-equivalent agent, prefer it for the doc-sync role specifically — it's a narrow, repetitive task and benefits from a dedicated definition. Otherwise, general-purpose is fine for every role; the role distinction lives in the **prompt**, not the agent type.

Record: `default_subagent_type`, and optionally `doc_sync_subagent_type` if a dedicated one exists.

## 3. Resolve where companion skill files live

Two mechanisms exist across tools:

- **Named skill invocation** — a tool lets you load a skill by name (e.g. a `Skill` tool) rather than reading a file path directly. If present, prefer it: invoke the skill by its `name` frontmatter field (e.g. `phase-ui-implement`) instead of constructing a path.
- **Direct file read** — read the `SKILL.md` at an absolute path. Check candidate roots in this order and use the first that resolves:
  1. `{project}/.claude/skills/{name}/SKILL.md` (project-local, Claude Code)
  2. `{project}/.cursor/skills/{name}/SKILL.md` (project-local, Cursor)
  3. `~/.claude/skills/{name}/SKILL.md`
  4. `~/.cursor/skills/{name}/SKILL.md`
  5. Wherever this phase-kit repo was cloned/installed — e.g. `{phase-kit-root}/skills/{name}/SKILL.md`

Record: `skill_load_mode` (`named` or `path`) and, if `path`, `skills_root`.

**In every other file in this kit**, references like "read `~/.cursor/skills/phase-ui-implement/SKILL.md`" mean: *load the `phase-ui-implement` skill using whatever `skill_load_mode` you resolved here.* Sub-agent prompts should pass whichever form is correct for the target session — a skill name if `named`, an absolute path if `path`.

## 4. Report once

Before Step 2 of phase-runner, log a one-line summary:

```
Runtime: {subagent_tool_name} sub-agents, type={default_subagent_type}, skills via {skill_load_mode}
```

If discovery was ambiguous at any step (e.g. two spawn-capable tools, no clear default type), ask the user once rather than guessing — then cache the answer for the run.

---

## Known-good presets (starting hints, not guarantees)

These are common configurations seen in the wild. Still confirm against what's actually in your tool list before trusting them — tool names and available subagent types change between versions.

| Environment | subagent_tool_name | default_subagent_type | skill_load_mode |
|---|---|---|---|
| Cursor | `Task` | `generalPurpose` (or project-defined) | `path` → `~/.cursor/skills/` |
| Claude Code (CLI) | `Task` | `general-purpose` | `path` → `.claude/skills/` or project agents dir |
| Claude in Cowork / Claude Agent SDK hosts | `Agent` | `general-purpose` (varies by host) | `named` if a `Skill` tool is present, else `path` |
