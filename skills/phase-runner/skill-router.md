# Skill Router

Resolved at Step 1.5, after `runtime-adapter.md` and `project-layout.md`. Decides which skills and which implementation agent role apply to each sprint, and each wave.

---

## 1. Scan available skills

Using the `skill_load_mode` resolved in `runtime-adapter.md`:

- **`named` mode:** list whatever skills your environment exposes (names + one-line descriptions only — don't load full bodies yet).
- **`path` mode:** scan `{skills_root}/*/SKILL.md` (and any additional roots your environment layers in, e.g. a project-local skills folder plus a global one) for frontmatter `name` + `description`.

Build a lightweight index: `{skill_name: description}`. This is a per-run scan, not a one-time cache — skills can be added mid-project.

## 2. Honor explicit skill requests

If the user names a skill directly when kicking off the run (e.g. "run phase 3 with responsive-testing" or an `@skill-name` mention), add it to that sprint's or wave's skill list regardless of what auto-routing below would pick. Explicit beats inferred, always.

## 3. Per-sprint routing

For each sprint in the run:

1. **Classify `implementation_agent`:**
   - `ui` — sprint's tasks primarily touch UI/component/page files, or the sprint's `### Verification` block has a `ui:` field.
   - `general` — everything else (data layer, API, schema, utils, mixed sprints where UI is incidental).
2. **Build `implementation_skills[]`:**
   - `ui` sprints: any UI-pattern skill available in your index (e.g. `ui-design-brain` if installed — **optional**, not a hard dependency; see phase-ui-implement) plus any domain-specific skill matched by keyword overlap between the sprint goal and skill descriptions.
   - `general` sprints: domain skills matched the same way (e.g. a database skill for schema-heavy sprints).
3. **Set `design_system_doc`** to `{workspace_root}/docs/design/design-system.md` whenever the sprint is `ui` or mixed-with-UI. Only if that file exists — note in the plan if it doesn't (design-planner hasn't run yet; implementation should fall back to matching existing components).

## 4. Per-wave routing

For each wave (one or more sprints running together):

1. **`wave_has_ui`** — true if any sprint in the wave is `ui` or mixed-with-UI.
2. **`verify_skills[]`** — usually just the stack's default check command from `project-layout.md`; add any skill explicitly named for verification (e.g. a project-specific test-running convention).
3. **`wave_test_skills[]`** — only when `wave_has_ui`. Populate from skills matched to browser/visual/responsive testing keywords in your skill index, plus anything the user explicitly requested. **Do not assume a specific testing skill is installed** — if nothing matches and the user didn't request one, note in the plan that wave-test will do a basic manual-style check (navigate, screenshot, read console) without a named skill's specific methodology.

## 5. Include the plan in the execution report

Alongside the wave plan (Step 2.5 of phase-runner), show:

```
Skill plan:
  Sprint {X.1} — implementation_agent: ui, skills: [ui-design-brain, ...], design_system: docs/design/design-system.md
  Sprint {X.2} — implementation_agent: general, skills: [...]
  Wave 1 — wave_test_skills: [visual-qa-testing, responsive-testing]
```

If a sprint has no clearly matched skills beyond the base implementation agent, that's fine — say `skills: [none matched]` rather than inventing one.
