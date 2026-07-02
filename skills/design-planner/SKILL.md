---
name: design-planner
description: "Establishes visual design language and screen contracts between project scope docs and phase-planner. Produces docs/design/DESIGN.md (Google design.md spec), screen specs, HTML mockups (screens/*.html + index hub), and design-system.md for phase-runner. Use when the user wants to design UI before phase planning, lock a design system, write screen specs, review HTML mockups, or run the design pass after a scope/rebuild plan. Trigger phrases: design pass, design-planner, design the UI, design system, DESIGN.md, screen specs, visual direction, before phase planner."
---

# Design Planner

Establishes **visual language and screen contracts** after a scope/rebuild plan and **before** phase-planner. Output feeds phase-planner (screen references in sprints) and phase-runner (`design-system.md` for UI implementation and wave-test asserts).

**Pipeline position:**

```
Scope doc (what/why/architecture)
    → design-planner (this skill)
    → phase-planner (sprints)
    → phase-runner (build)
```

**Not this skill:** Architecture, API design, sprint breakdown, or implementation. Use scope docs + phase-planner + phase-runner for those. Use `product-planner` only for non-UI product exploration — not as a substitute for this step.

For file templates, token schema, and screen-spec format, see [reference.md](reference.md).

---

## Step 1 — Resolve project layout

Run once at the start. Same rules as phase-runner's `project-layout.md` — read that file if this project also uses phase-runner, otherwise resolve directly:

| Path | Role |
|------|------|
| **workspace_root** | Folder containing `docs/` — design artifacts live here |
| **app_root** | Folder with the stack manifest and `src/` (often a subfolder like `{name}-app/`) |

**Design output paths (all under workspace_root):**

| File | Purpose |
|------|---------|
| `docs/design/DESIGN.md` | Canonical agent contract — Google [design.md](https://github.com/google-labs-code/design.md) spec |
| `docs/design/design-system.md` | Expanded patterns — **phase-runner reads this path** |
| `docs/design/screens/*.md` | Per-surface screen specs (acceptance criteria for phase-planner) |
| `docs/design/screens/*.html` | **Reviewable HTML mockups** — one per screen + `index.html` hub |
| `docs/design/screens/_theme.css` | Shared styles for the mockups — this project's own visual direction, established in Step 4 |

Report layout before writing:

```
Design pass layout:
  workspace_root: {path}
  app_root:       {path}
  scope input:    {path to scope doc or "conversation"}
```

If `docs/design/` already exists, read all files before editing. Preserve locked decisions unless the user asks to revise.

---

## Step 2 — Read inputs

Read in order:

1. **Scope doc** — user path or pasted plan (e.g. a rebuild plan or product spec under `docs/`). Extract product name, audience, UI surfaces mentioned, hard UX rules, stack (web framework, desktop shell, etc.).
2. **Project convention docs** — `CLAUDE.md` / `README.md` / equivalent, for terminology and conventions the project already uses (many products have their own vocabulary for core concepts — use whatever the scope doc or existing docs establish, don't invent new terms).
3. **Existing design** — `docs/design/*`, root `DESIGN.md`, prior prototypes.
4. **App context** — skim `app_root`'s manifest file, existing routes/components if UI already exists. Note what to extend vs. replace.

Do not re-interview on facts already in the scope doc. Ask only for gaps that block design decisions.

---

## Step 3 — Surface inventory

Produce a table before any visual work. Save it inside `docs/design/DESIGN.md` under `## Surfaces` (extension section — allowed by design.md spec) or as a standalone `docs/design/surface-inventory.md` when the list is long.

| Surface | Route / shell | Phase | Priority | Notes |
|---------|---------------|-------|----------|-------|
| {e.g. Settings — Profile editor} | `/settings/profile` | 2 | P0 | {any notable constraint} |
| {e.g. Onboarding overlay} | Modal / full-screen | 1 | P0 | {any notable constraint} |

**Scope rule:** Spec surfaces for **near-term phases only** (typically Phase 1–3). Defer Phase 4+ to a later design pass unless the user explicitly asks.

Present the inventory to the user. Confirm missing surfaces or wrong priorities before locking direction.

---

## Step 4 — Design direction

Commit one aesthetic direction before writing tokens. If a frontend/visual-direction skill is available in this environment, read its design-thinking guidance for the direction workshop and apply its purpose/tone/constraints/differentiation framing to **this product**, not generic SaaS. If no such skill is available, run the workshop yourself using the same framing: what's the product's purpose, tone, and what should differentiate it visually from competitors.

### Present 2–3 directions

Each direction is a short card:

- **Name** — a short evocative label for this direction
- **One-line mood**
- **Type + color posture** — fonts, light/dark, accent strategy
- **Fit** — why it matches the product thesis
- **Risk** — what it makes harder

Ask the user to pick one, blend two, or describe a reference (site, app, image). **Do not lock tokens until they confirm.**

### Multi-surface products

When surfaces have different jobs (e.g. a control-panel shell vs. a public-facing web app), either:

- **One system, two modes** — shared tokens + mode overrides in YAML (e.g. `colors.panel-*` vs `colors.public-*`), or
- **Split design passes** — one pass per surface family (run skill twice)

State the choice in `DESIGN.md` Overview.

### Optional prototypes

If direction is ambiguous, write **one** static HTML file to `docs/design/prototypes/{name}.html` using the chosen direction. Inline CSS only. Present it to the user for review. Prototypes are throwaway — tokens in `DESIGN.md` are the contract once approved.

---

## Step 5 — Write DESIGN.md

Write `docs/design/DESIGN.md` following the Google design.md spec. See [reference.md](reference.md) for the full template.

**Requirements:**

1. **YAML front matter** — `name`, `version: alpha`, token groups: `colors`, `typography`, `spacing`, `rounded`, `components` (minimum: primary button + one input)
2. **Body sections** in spec order: Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts
3. **Prose matches tokens** — every accent color in prose exists in YAML; tokens are normative
4. **Product-specific Do's and Don'ts** — translate scope UX rules (e.g. "never show blocking error dialogs" → explicit component behavior)
5. **Terminology** — use whatever project-specific terms the scope doc or existing docs already established; don't introduce new ones here

After writing, run lint when available:

```bash
npx @google/design.md lint docs/design/DESIGN.md
```

If lint fails, fix before proceeding. If the CLI is unavailable, self-check against [reference.md](reference.md) checklist.

**Optional:** Copy or symlink to `{workspace_root}/DESIGN.md` when the user wants root-level discovery — note both paths in the handoff.

---

## Step 6 — Write screen specs + HTML mockups

For each P0/P1 surface, create **both**:

1. **Markdown spec** — `docs/design/screens/{kebab-name}.md` (acceptance criteria for phase-runner)
2. **HTML mockup** — `docs/design/screens/{kebab-name}.html` (visual review for the user)

Use the templates in [reference.md](reference.md). Shared styles live in `docs/design/screens/_theme.css` (tokens, panels, buttons — reuse from an existing repo if this is a rebuild).

Also write **`docs/design/screens/index.html`** — hub linking all mockups.

Each markdown spec must include:

- Route or shell type
- Purpose (one sentence)
- Layout wireframe (ASCII or structured blocks)
- Component list (names matching DESIGN.md)
- **States matrix** — empty, loading, error, success, edge cases from scope doc
- Copy rules — labels, empty states, forbidden phrases
- **Acceptance bullets** — observable checks for phase-runner `Verification.assert`
- **Preview:** link to sibling `.html` mockup

Each HTML mockup must:

- Use `_theme.css` + screen-specific inline styles only when needed
- Include a fixed review bar: screen name, phase, link back to `index.html`
- Render real tokens from DESIGN.md (not generic wireframe gray boxes)
- Label interactive regions

Link each spec from DESIGN.md `## Surfaces` table (Spec + Preview columns).

Do not duplicate token tables in screen specs — reference `DESIGN.md` sections instead.

---

## Step 7 — Seed design-system.md

Write or update `docs/design/design-system.md`. This is the **operational doc phase-runner injects** into UI implementation and wave-test.

Structure:

1. Header — last updated, links to `DESIGN.md`, optional HTML gallery path
2. **Design intent** — condensed from Overview (table of principles)
3. **Design tokens** — CSS custom properties derived from YAML (copy-paste ready `:root` block)
4. **Typography scale** — table mapping elements → tokens
5. **Core component patterns** — ASCII + class/CSS conventions for buttons, inputs, cards, modals used in screen specs
6. **UI copy** — voice rules for visible strings
7. **Screen index** — table linking surface → spec file → route

**Source-of-truth rule:**

| File | Role |
|------|------|
| `DESIGN.md` | Locked tokens + rationale — edit in design pass |
| `design-system.md` | Expanded patterns — grows during early UI sprints; token changes must trace back to `DESIGN.md` |

When both exist and conflict on token values, **DESIGN.md wins** — update design-system.md to match.

---

## Step 8 — Handoff

Present saved paths and the review hub:

```
Design pass complete.

Review mockups (open in browser):
  docs/design/screens/index.html

Artifacts:
  docs/design/DESIGN.md
  docs/design/design-system.md
  docs/design/screens/*.md + *.html

Next steps:

1. **Generate phase plans** — hand off to phase-planner:
   "Use docs/design/ and {scope doc path}. Generate phase plans.
    UI sprints must reference screen spec paths in the Reference column.
    Verification assert lines should come from screen spec acceptance bullets."

2. **Iterate** — revise direction, add a screen, or update tokens in DESIGN.md
```

If the user asks to proceed immediately, read the phase-planner skill and generate phase plans using design artifacts as constraints.

### Phase-planner constraints (include in handoff)

When invoking phase-planner, require:

- UI task **Reference** column → `docs/design/screens/{file}.md`
- Sprint **Verification** `assert:` lines → from screen spec acceptance bullets
- No visual invention in task descriptions — "implement per screen spec"
- Data-only sprints → `skip-ui: true`; no design references needed

---

## Operations (iteration)

| User says | Action |
|-----------|--------|
| "revise direction" / "new aesthetic" | Re-run Step 4 → rewrite DESIGN.md tokens + design-system.md; flag screen specs that need layout updates |
| "add screen for X" | New `screens/*.md`; update screen index in design-system.md |
| "update tokens" / "change accent" | Edit DESIGN.md YAML + prose → sync design-system.md CSS block |
| "sync design-system from DESIGN" | Regenerate token/CSS sections from DESIGN.md; preserve component patterns |
| "design pass report" | List surfaces specced vs. deferred; lint status; files changed |

Use targeted edits. One write pass per operation when possible.

---

## Integration map

| Skill / tool | When |
|--------------|------|
| **Scope doc** | Input — product/architecture only |
| **design-planner** | This skill — visual language + screens |
| **phase-planner** | Sprints — references screen specs |
| **phase-runner** | Build — reads `design-system.md`; wave-test asserts against it |
| **A frontend-design-style skill, if available** | Direction workshop + optional prototypes only — not production UI |
| **A ui-pattern skill, if available** | Implementation patterns during phase-runner — loses to project design docs |
| **product-planner** | Non-UI product planning — do not use for design-system output |

---

## Quality checks before finishing

- [ ] User confirmed design direction (Step 4)
- [ ] `DESIGN.md` has valid YAML + all required body sections (or omitted with reason)
- [ ] Lint passes or manual checklist complete
- [ ] Every P0/P1 surface has a screen spec **and** HTML mockup with link from spec
- [ ] `docs/design/screens/index.html` hub links all mockups
- [ ] `design-system.md` exists with CSS tokens aligned to DESIGN.md
- [ ] Scope UX hard rules appear in Do's and Don'ts
- [ ] No sprint/task breakdown in design artifacts (that's phase-planner's job)
- [ ] Artifacts saved under `workspace_root/docs/design/`, not inside app_root unless user explicitly uses single-folder layout

---

## Anti-patterns

- **Skipping direction confirmation** — locking tokens without user pick → rework in every UI sprint
- **Specifying all future phases** — over-design before validation
- **HTML monolith plan** — that's product-planner; use markdown screen specs instead
- **Tokens only in design-system.md** — DESIGN.md must exist as the portable agent contract
- **Generic AI aesthetics** — a default sans-serif + purple gradient unless the product explicitly calls for it
- **Implementing production components in this skill** — prototypes are static HTML only; code ships in phase-runner
