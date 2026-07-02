---
name: product-planner
description: "Plans out a product, product feature, or set of related features and produces a rich HTML planning document. Use when the user wants to plan a new feature, explore implementation options, design a product flow, or create a visual spec before generating phase plans. Output is a self-contained HTML file saved to docs/ and presented as a viewable artifact. The HTML includes: overview, data flow diagram, options considered, UI mockups, technical decisions, and open questions. Designed to feed directly into phase-planner for phase plan generation. Trigger phrases: 'plan this feature', 'help me think through', 'create a product plan', 'plan out', 'I want to build', 'design the flow for', 'what are my options for', 'spec this out'."
---

# Product Planner

Produces a rich, self-contained **HTML planning document** from a product or feature description. This document serves as the primary reference artifact for implementation agents and feeds into `phase-planner` for phase plan generation.

The output is NOT markdown. It is a single navigable HTML file with visual sections, SVG diagrams, and mockups — something you'll actually open and read.

---

## Step 1 — Gather Context

Before writing anything, get the information needed to produce a useful plan. Two paths:

### Path A — User has an existing plan doc

If the user pastes a plan or references an existing file (e.g. `docs/BuildPlan.md` or similar), read it. Extract:
- Feature/product name and one-line description
- Key goals and success criteria
- Any architecture, stack, or constraints already decided
- Any data flow or sequence already described
- Open questions still unresolved

Use the existing doc as the **source of truth** — don't re-interview on things already answered. Only ask for what's genuinely missing.

### Path B — Starting from scratch

Ask the user the following (combine into one message, not one question at a time):

```
To build the plan, I need a few things:

1. **What are we building?** — feature name and one-line description
2. **What problem does it solve?** — user need or workflow it replaces
3. **Scope** — single feature, multiple related features, or full product?
4. **Stack constraints** — existing tech stack or greenfield?
5. **Any options already on the table?** — approaches you're considering or have ruled out
6. **Anything already decided?** — architectural choices, APIs, data models locked in
7. **What's the biggest unknown?** — what you most need this plan to help figure out
```

Don't proceed to Step 2 until you have enough to write a substantive plan. If the user gives a one-liner, probe for the minimum viable context before writing.

---

## Step 2 — Read Project Context

Before writing the plan, read the project's existing codebase context to ground the plan in reality:

1. Read `CLAUDE.md` in the project folder (if present) for stack and conventions
2. Scan `docs/` for any existing phase plans, architecture docs, or prior specs
3. If the project has a repo, do a quick scan of key structural files (e.g. the stack manifest, schema files, main route files) to understand the current state
4. Note what already exists vs. what's net-new

This context informs the data flow diagram, option feasibility, and technical decision sections.

---

## Step 3 — Generate the HTML Plan

Write a single self-contained HTML file. Follow the structure below precisely. Use inline CSS — no external stylesheets or CDN dependencies. The file must open correctly in a browser with no server.

### File naming

```
docs/Plan-{FeatureName}-{YYYY-MM-DD}.html
```

e.g. `docs/Plan-NotificationsRework-2026-05-22.html`

Save to the project's `docs/` folder (the top-level coordination folder, NOT inside the app subfolder).

### Required HTML structure

The document uses a **left sidebar navigation** with **anchor-linked sections**. All sections are visible on the page — no tabs or JS required, just a sticky nav for long docs. Use a clean, readable design with good typographic hierarchy.

#### Mandatory sections (in order):

**1. Header / Hero**
- Feature name (large)
- One-line description
- Date, project name, status badge (Draft / In Review / Approved)
- Author if known

**2. Overview**
- What we're building (2–4 sentences)
- Why we're building it — user need or problem being solved
- What success looks like — measurable outcomes or acceptance criteria
- Scope: what's in, what's explicitly out

**3. Data Flow**
- SVG diagram showing system components, data movement, and key decision points
- Label every node and arrow clearly
- Use color to distinguish: user actions (blue), system components (gray), external APIs (orange), data stores (green)
- Include a brief narrative below the diagram explaining the flow in plain English

**4. Options Considered**
- For each approach considered (minimum 2, maximum 5):
  - Option name + one-line description
  - Pros (green-accented list)
  - Cons (red-accented list)
  - Verdict: Selected / Rejected / Deferred (with reason)
- If only one option was considered, say so and explain why no alternatives were evaluated

**5. UI Mockups** *(omit only if purely backend/infra with zero UI surface)*
- HTML wireframes — structural layout, not visual polish
- Label every interactive element (buttons, inputs, dropdowns)
- Include at minimum: the primary user-facing screen and any key state changes (empty state, loading, error, success)
- Use simple bordered divs and placeholder text — this is a wireframe, not a design

**6. Technical Decisions**
- Locked-in architectural and implementation choices
- Format each as:
  - **Decision:** What was decided
  - **Rationale:** Why
  - **Constraints:** What this rules out going forward
- Include only genuinely decided things — not aspirations

**7. Open Questions / Risks**
- Unresolved decisions that will affect implementation
- Format each as:
  - **Question:** What needs to be answered
  - **Impact:** What depends on this answer
  - **Owner:** Who needs to answer it (user, external team, research)
- Include real risks (technical, scope, dependency) with likelihood and impact notes

**8. Implementation Handoff**
- A crisp summary for phase-planner: what this plan produces, what the first sprint should accomplish, key constraints the implementation agent needs to know
- Suggested phase structure (rough, non-binding): e.g. "Phase 1: API integration → Phase 2: UI → Phase 3: Polish"
- A "Generate Phase Plan" prompt the user can copy-paste to phase-planner:

```
Use this plan as input: [path to this HTML file]
Generate a phase plan for [feature name]. Stack: [stack].
First phase goal: [first phase goal].
```

### HTML design guidelines

- Background: `#f9fafb` (light gray page), `#ffffff` (card/section backgrounds)
- Sidebar: `#1e293b` (dark navy), white text, active link highlight `#3b82f6`
- Accent colors: blue `#3b82f6`, green `#22c55e`, red `#ef4444`, amber `#f59e0b`, gray `#6b7280`
- Font: `system-ui, -apple-system, sans-serif`
- Section cards: white background, `border: 1px solid #e2e8f0`, `border-radius: 8px`, `padding: 24px`
- Max content width: `900px`, centered
- Sidebar width: `220px`, fixed position on left
- At `< 768px`: sidebar collapses to a top nav or is hidden — include a minimal responsive rule

These are defaults for the **planning document itself** (a tool for you to read the plan), not a statement about the product's own visual identity — that's design-planner's job, if this project uses one.

### SVG diagram guidelines

- Viewbox: `0 0 800 400` or taller as needed
- Nodes: `rx="6"` rounded rectangles, labeled with `<text>` elements
- Arrows: `<line>` or `<path>` with `marker-end` arrowhead definitions in `<defs>`
- Keep it legible: minimum font size 13px, adequate spacing between nodes
- Don't use ASCII art — always SVG for diagrams

---

## Step 4 — Save and Present

1. Write the file to `docs/Plan-{FeatureName}-{YYYY-MM-DD}.html` in the project folder
2. Present it to the user
3. Offer the user two follow-up options:

```
Plan saved. Next steps:

1. **Generate phase plans** — hand this off to phase-planner:
   "Use docs/Plan-{name}.html as input. Generate phase plans for {feature}."

2. **Iterate on the plan** — tell me what to adjust: add a section, revise an option,
   update the data flow, add mockups for a specific screen, etc.
```

---

## Step 5 — Handoff to Phase Planner (if requested)

If the user asks to proceed to phase planning immediately after the plan is created:

1. Read the Implementation Handoff section from the plan
2. Invoke the `phase-planner` skill with the plan as context
3. The phase plans go to `docs/phases/Phase-{N}-{Name}.md` as normal markdown — the HTML plan is the *input spec*, not the output format

The HTML plan file persists as a reference artifact. Implementation agents spawned by `phase-runner` should be pointed at it for full context.

---

## Iteration

If the user asks to update an existing plan (e.g. "revise the options section", "add a mockup for the settings screen", "update the data flow now that we've decided on X"):

1. Read the existing HTML file
2. Make the targeted edit — don't rewrite the whole file unless asked
3. Re-save and re-present the link
4. Note what changed in one line

---

## Quality checks before saving

- [ ] All 8 sections present (or UI Mockups explicitly omitted with reason)
- [ ] SVG data flow diagram is present and labeled
- [ ] At least 2 options compared in Options Considered
- [ ] Sidebar navigation links to all sections via anchor IDs
- [ ] File opens correctly with no external dependencies
- [ ] Implementation Handoff section includes the phase-planner prompt
- [ ] File saved to `docs/` (not inside the app subfolder)
