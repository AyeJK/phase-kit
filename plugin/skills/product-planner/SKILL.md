---
name: product-planner
description: "Plans out a product, product feature, or set of related features and produces a rich HTML planning document. Use when the user wants to plan a new feature, explore implementation options, design a product flow, or create a visual spec before generating phase plans. Output is a self-contained HTML file saved to docs/ and presented as a viewable artifact. The HTML includes: overview, data flow diagram, options considered, UI mockups, technical decisions, and open questions. Designed to feed directly into phase-planner for phase plan generation. Trigger phrases: 'plan this feature', 'help me think through', 'create a product plan', 'plan out', 'I want to build', 'design the flow for', 'what are my options for', 'spec this out'."
---

# Product Planner

Produces a rich, self-contained **HTML planning document** from a product or feature description. This document serves as the primary reference for implementation agents and feeds into `phase-planner` for phase plan generation.

The output is NOT markdown. It is a single navigable HTML file with visual sections, SVG diagrams, and mockups — something you'll actually open and read.

The file in `docs/` is the plan. In a session that can publish artifacts, the same file is also published as a hosted page with a shareable link (Step 4). That page is a copy for reading and sharing; nothing downstream reads it.

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

The path is always the file in `docs/`, never an artifact link.

### HTML design guidelines

The plan has to read correctly in two places: opened from disk, and hosted as an artifact (Step 4). The first three rules are what make that work.

- Title: `<title>` is the feature name and nothing else — e.g. `<title>Notifications Rework</title>`. No "Plan:" prefix, no date, no description after a dash or colon. Put it first in `<head>`; a hosted copy takes its name from it
- Colors: define every color once as a `:root` token, with a dark-mode set (block below). Everything else uses `var(--token)` — cards, sidebar, badges, wireframes, SVG fills and strokes. No literal color values outside the token blocks
- Body: `body` sets `background: var(--bg)` and `color: var(--text)` explicitly. A hosted page sits on the host's own background, and a `body` without one lets it show through
- Page: `var(--bg)` (light gray), with `var(--surface)` (white) for card/section backgrounds
- Sidebar: `var(--sidebar-bg)` (dark navy), `var(--sidebar-text)`, active link highlight `var(--blue)`
- Accent colors: `var(--blue)`, `var(--green)`, `var(--red)`, `var(--amber)`, `var(--gray)`
- Font: `system-ui, -apple-system, sans-serif`
- Section cards: `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 24px`
- Max content width: `900px`, centered
- Sidebar width: `220px`, fixed position on left
- At `< 768px`: sidebar collapses to a top nav or is hidden — include a minimal responsive rule

The token block, at the top of the plan's `<style>`:

```css
:root {
  --bg: #f9fafb;            /* page */
  --surface: #ffffff;       /* cards and sections */
  --border: #e2e8f0;
  --text: #0f172a;
  --muted: #6b7280;         /* secondary text */
  --sidebar-bg: #1e293b;
  --sidebar-text: #ffffff;
  --blue: #3b82f6;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
  --gray: #6b7280;
}

/* Dark set: the reader's system setting, unless the host has pinned light */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --sidebar-bg: #0b1120;
    --sidebar-text: #f1f5f9;
    --blue: #60a5fa;
    --green: #4ade80;
    --red: #f87171;
    --amber: #fbbf24;
    --gray: #94a3b8;
    color-scheme: dark;
  }
}

/* The same dark values again, for a host that sets its theme on the root element */
:root[data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --sidebar-bg: #0b1120;
  --sidebar-text: #f1f5f9;
  --blue: #60a5fa;
  --green: #4ade80;
  --red: #f87171;
  --amber: #fbbf24;
  --gray: #94a3b8;
  color-scheme: dark;
}

body { background: var(--bg); color: var(--text); }
```

Every token gets its first definition in the bare `:root` block; the two dark blocks only redefine. Add tokens if the plan needs more colors, in all three blocks. The `data-theme` selectors do nothing when the file is opened from disk, where the media query alone decides.

These are defaults for the **planning document itself** (a tool for you to read the plan), not a statement about the product's own visual identity — that's design-planner's job, if this project uses one.

### SVG diagram guidelines

- Viewbox: `0 0 800 400` or taller as needed
- Nodes: `rx="6"` rounded rectangles, labeled with `<text>` elements
- Arrows: `<line>` or `<path>` with `marker-end` arrowhead definitions in `<defs>`
- Colors: fills, strokes and text come from the tokens (`style="fill: var(--blue)"` or a CSS class), never a literal value, so the diagram reads in both themes. Orange is `var(--amber)`. Check that each label reads against its node's fill
- Keep it legible: minimum font size 13px, adequate spacing between nodes
- Don't use ASCII art — always SVG for diagrams

---

## Step 4 — Save and Present

1. Write the file to `docs/Plan-{FeatureName}-{YYYY-MM-DD}.html` in the project folder
2. If the session can publish the file as an artifact, publish it (see below). If it can't, skip this step
3. Present it to the user: the file path, plus the artifact link if step 2 published one
4. Offer the user two follow-up options:

```
Plan saved. Next steps:

1. **Generate phase plans** — hand this off to phase-planner:
   "Use docs/Plan-{name}.html as input. Generate phase plans for {feature}."

2. **Iterate on the plan** — tell me what to adjust: add a section, revise an option,
   update the data flow, add mockups for a specific screen, etc.
```

### Publishing the plan as an artifact

Some sessions have an Artifact tool that publishes a local HTML file as a hosted page and returns its link (Claude app sessions do). Check the session's tools instead of assuming. With no such tool, present the file exactly as you would have before and say nothing about artifacts.

When the tool is there:

1. **Publish the saved file.** Give the tool the path of the file from step 1 — that file, not a copy or a rewritten version. Supply whatever else it asks for on a first publish (a one-sentence description, for example)
2. **Record the URL.** Add this tag to the file's `<head>`, straight after `<title>`:

   ```html
   <meta name="phase-runner:artifact" content="{url}">
   ```

   A later session reads the tag and republishes to the same URL instead of creating a second artifact. Don't republish just to get the tag into the hosted copy — the next revision carries it
3. **Give the user both.** The artifact link for reading and sharing, and the file path as the spec

Rules for every publish:

- **The file is the plan.** Publishing never replaces, moves or renames it, and every change goes into the file first. The artifact is a hosted copy of it
- **A failed publish is one line, never a stop.** If the tool errors or refuses, say so in one line of the reply (`Couldn't publish the artifact: {reason}. The plan is at docs/Plan-{name}.html.`) and carry on to the follow-up options. No retry loop, and nothing for the user to fix before they can use the plan
- **One plan, one artifact.** A file that already has a `phase-runner:artifact` tag is republished to that URL, as Iteration describes
- **The plan keeps its own design.** If the tool comes with page-design guidance, apply it only where it's about hosting (the title, theme tokens, what may load from outside the page). The sections and layout stay as Step 3 describes

---

## Step 5 — Handoff to Phase Planner (if requested)

If the user asks to proceed to phase planning immediately after the plan is created:

1. Read the Implementation Handoff section from the plan file
2. Invoke the `phase-planner` skill with the plan's file path (`docs/Plan-{name}.html`) as context
3. The phase plans go to `docs/phases/Phase-{N}-{Name}.md` as normal markdown — the HTML plan is the *input spec*, not the output format

The HTML plan file persists as the reference. `phase-planner` and the implementation agents spawned by `phase-builder` are pointed at its file path for full context — never at the artifact URL, even when one exists. They read `docs/`, and an artifact link is not something they can rely on being able to open.

---

## Iteration

If the user asks to update an existing plan (e.g. "revise the options section", "add a mockup for the settings screen", "update the data flow now that we've decided on X"):

1. Read the existing HTML file — the one in `docs/`, not the published page
2. Make the targeted edit — don't rewrite the whole file unless asked
3. Re-save the file
4. If the session can publish artifacts, republish it (see below)
5. Re-present the file path, and the artifact link if there is one
6. Note what changed in one line

### Republishing a revised plan

The edit goes into the file first; the artifact is updated from the file, never the other way round.

- **The file has a `<meta name="phase-runner:artifact">` tag.** Republish the file to the URL in its `content`, so the same link now shows the revision. The tool may want the live page read before a new session can update it; do that read if it asks, then publish the file. If the two differ, the file wins
- **The file has no tag.** Publish it as new and record the URL, as in Step 4. This covers plans written in a session that couldn't publish
- **Republishing to the recorded URL fails.** Say so in one line and leave the tag as it is. Don't publish a second artifact on your own; if the user asks for a new one, publish it and replace the URL in the tag
- **The session can't publish.** Edit and re-save as before, and leave any existing tag in place for a later session

---

## Quality checks before saving

- [ ] All 8 sections present (or UI Mockups explicitly omitted with reason)
- [ ] SVG data flow diagram is present and labeled
- [ ] At least 2 options compared in Options Considered
- [ ] Sidebar navigation links to all sections via anchor IDs
- [ ] File opens correctly with no external dependencies
- [ ] `<title>` is the feature name alone
- [ ] Every color is a `:root` token with a dark-mode value, and `body` sets its background from one
- [ ] Implementation Handoff section includes the phase-planner prompt, with the file path
- [ ] File saved to `docs/` (not inside the app subfolder)
