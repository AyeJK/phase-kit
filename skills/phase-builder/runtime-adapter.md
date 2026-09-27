# Runtime Adapter

Resolved **once**, at Step 1, alongside `project-layout.md`. Cache the result for the entire run — never re-resolve per sprint.

This file exists because the Phase Runner skills spawn sub-agents and read companion skill files, and the mechanics for both differ by coding agent (Cursor, Claude Code, other Claude Code-compatible tools). Rather than hardcoding one tool's conventions, resolve them by **discovery** — inspect what's actually available in the current session instead of assuming.

Guessing wrong here is worse than asking once. Do the discovery.

---

## 1. Resolve the sub-agent spawn tool

Look at your available tool list for a tool that spawns an independent sub-agent with its own context window (as opposed to a shell/exec tool). This is commonly named `Task` or `Agent`. Use whichever is present.

Record: `subagent_tool_name` (e.g. `Task`, `Agent`).

If more than one qualifies, prefer the one whose description mentions delegating multi-step work or spawning specialized agents over one that just runs a single command.

If none exists, phase-builder cannot orchestrate sub-agents — report this to the user immediately rather than proceeding. (You can still run phase-planner, design-planner, and product-planner standalone; those don't require sub-agent spawning.)

## 2. Resolve valid sub-agent type names

Do not assume a specific custom type (e.g. `technician`) exists. Check what's actually offered:

- If the spawn tool's schema or description lists specific subagent types, use the most general-purpose one available (commonly `general-purpose`, `generalPurpose`, or unnamed/default) for implementation, verify, wave-test, and doc-sync Tasks.
- If your environment supports custom-defined sub-agents (e.g. Claude Code project agents under `.claude/agents/*.md`), and the project defines a `doc-sync` or `technician`-equivalent agent, prefer it for the doc-sync role specifically — it's a narrow, repetitive task and benefits from a dedicated definition. Otherwise, general-purpose is fine for every role; the role distinction lives in the **prompt**, not the agent type.

Record: `default_subagent_type`, and optionally `doc_sync_subagent_type` if a dedicated one exists.

## 3. Resolve a model override for the gate roles (optional)

The three gates are narrow: `phase-verify` runs commands and reports pass/fail, `phase-doc-sync` edits status cells, and `phase-wave-test` drives a browser through a known checklist. None needs the model tier that implementation needs. Wave-test is also the most expensive role by volume (about half of a UI-heavy phase run), so its model choice matters most. If your spawn tool accepts a per-call model override (check its schema for a `model` parameter or similar), resolve a cheaper/faster tier for these three roles.

- If a model override parameter exists, record `gate_model` (e.g. a faster/cheaper model than the run's default). Use it when spawning `phase-verify`, `phase-doc-sync` and `phase-wave-test` — never for implementation or the orchestrator.
- If the user asks for a stronger model on wave-test (e.g. for a design-heavy phase), honor it for that run.
- If no override parameter exists, skip this — every role runs on the session's default model. This is a cost optimization, not a correctness requirement; never block a run over it.

Record: `gate_model` (optional — omit if unresolved).

## 4. Resolve where companion skill files live

Two mechanisms exist across tools:

- **Named skill invocation** — a tool lets you load a skill by name (e.g. a `Skill` tool) rather than reading a file path directly. If present, prefer it: invoke the skill by its `name` frontmatter field (e.g. `phase-ui-implement`) instead of constructing a path.
  - **Installed as a plugin?** Plugin skills are namespaced by plugin name, so the name to invoke is `phase-runner:phase-ui-implement`, not `phase-ui-implement`. Check the skill list the session exposes: if the kit's skills appear with a `phase-runner:` prefix, record `skill_prefix: "phase-runner:"` and prepend it to every skill name you invoke or pass to a sub-agent. If they appear bare, `skill_prefix` is empty.
- **Direct file read** — read the `SKILL.md` at an absolute path. Check candidate roots in this order and use the first that resolves:
  1. `{project}/.claude/skills/{name}/SKILL.md` (project-local, Claude Code)
  2. `{project}/.cursor/skills/{name}/SKILL.md` (project-local, Cursor)
  3. `~/.claude/skills/{name}/SKILL.md`
  4. `~/.cursor/skills/{name}/SKILL.md`
  5. The plugin install, if the kit was installed as a Claude Code plugin — the plugin cache under `~/.claude/plugins/` (e.g. `~/.claude/plugins/cache/phase-runner/phase-runner/{version-or-sha}/skills/{name}/SKILL.md`). Don't hardcode the version segment; locate the folder that contains this `runtime-adapter.md` and use its sibling `skills/` directory.
  6. Wherever this Phase Runner repo was cloned — e.g. `{phase-runner-root}/skills/{name}/SKILL.md`

Record: `skill_load_mode` (`named` or `path`), `skill_prefix` (if `named`; empty unless plugin-installed), and, if `path`, `skills_root`.

**In every other file in this kit**, references like "read `~/.cursor/skills/phase-ui-implement/SKILL.md`" mean: *load the `phase-ui-implement` skill using whatever `skill_load_mode` you resolved here.* Sub-agent prompts should pass whichever form is correct for the target session — a skill name if `named`, an absolute path if `path`.

## 5. Report once

Before Step 2 of phase-builder, log a one-line summary:

```
Runtime: {subagent_tool_name} sub-agents, type={default_subagent_type}, skills via {skill_load_mode}{, gate model={gate_model} if resolved}
```

If discovery was ambiguous at any step (e.g. two spawn-capable tools, no clear default type), ask the user once rather than guessing — then cache the answer for the run.

---

## Known-good presets (starting hints, not guarantees)

These are common configurations seen in the wild. Still confirm against what's actually in your tool list before trusting them — tool names and available subagent types change between versions.

| Environment | subagent_tool_name | default_subagent_type | skill_load_mode |
|---|---|---|---|
| Cursor | `Task` | `generalPurpose` (or project-defined) | `path` → `~/.cursor/skills/` |
| Claude Code (CLI) | `Task` | `general-purpose` | `path` → `.claude/skills/` or project agents dir |
| Claude Code (CLI), installed as plugin | `Task` / `Agent` | `general-purpose` | `named` with `skill_prefix: "phase-runner:"` |
| Claude in Cowork / Claude Agent SDK hosts | `Agent` | `general-purpose` (varies by host) | `named` if a `Skill` tool is present, else `path` |
