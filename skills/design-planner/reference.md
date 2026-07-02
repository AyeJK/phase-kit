# Design Planner — Reference

File templates, token schema, and screen-spec format.

---

## DESIGN.md template (Google design.md spec)

```markdown
---
name: {Product Name}
version: alpha
colors:
  background: "#..."
  surface: "#..."
  text-primary: "#..."
  text-secondary: "#..."
  accent: "#..."
  border: "#..."
  # add semantic colors as needed: success, warning, danger
typography:
  display-font: "{font family}"
  body-font: "{font family}"
  scale:
    xs: "12px"
    sm: "14px"
    base: "16px"
    lg: "20px"
    xl: "28px"
    display: "40px"
spacing:
  unit: "8px"
  scale: [4, 8, 12, 16, 24, 32, 48, 64]
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
components:
  button:
    primary:
      background: "{accent}"
      text: "{on-accent color}"
      radius: "{rounded.md}"
  input:
    background: "{surface}"
    border: "{border}"
    radius: "{rounded.sm}"
---

# {Product Name} — Design System

## Overview

{2-4 sentences: what this product is, who it's for, and the one-line design thesis — e.g. "warm and editorial" or "dense and utilitarian."}

## Colors

{Prose explanation of the palette above — when to use accent vs. neutral, dark/light mode notes if applicable.}

## Typography

{Prose explanation of the type scale and font pairing rationale.}

## Layout

{Grid/spacing philosophy, page structure conventions, responsive breakpoints.}

## Elevation & Depth

{Shadow/border conventions for layering — cards, modals, dropdowns.}

## Shapes

{Corner radius usage — when sharp vs. rounded, and why.}

## Components

{Per-component notes beyond the YAML tokens — states, variants, sizing.}

## Do's and Don'ts

**Do:**
- {Product-specific rule translated from scope doc UX requirements}

**Don't:**
- {Product-specific anti-pattern, often the inverse of a hard UX rule from the scope doc}

## Surfaces

| Surface | Route / shell | Phase | Priority | Spec | Preview |
|---------|---------------|-------|----------|------|---------|
| {name} | {route} | {N} | {P0/P1/P2} | [spec](screens/{name}.md) | [preview](screens/{name}.html) |
```

---

## Screen spec template

`docs/design/screens/{kebab-name}.md`:

```markdown
# {Screen Name}

**Route/shell:** {route or shell type, e.g. modal, full-screen, sidebar panel}
**Phase:** {N}
**Purpose:** {one sentence}

## Layout

```
{ASCII wireframe or structured block description}
```

## Components

- {Component name} — {brief note, matches DESIGN.md component list}
- {Component name} — {brief note}

## States

| State | Behavior |
|-------|----------|
| Empty | {what's shown with no data} |
| Loading | {skeleton, spinner, or other} |
| Error | {inline vs. toast vs. blocking — per DESIGN.md Do's/Don'ts} |
| Success | {confirmation pattern} |
| {Edge case from scope doc} | {behavior} |

## Copy rules

- {Label conventions, forbidden phrases, tone notes specific to this screen}

## Acceptance bullets

- {Observable, testable outcome — feeds phase-runner Verification.assert}
- {Observable, testable outcome}

**Preview:** [{kebab-name}.html]({kebab-name}.html)
```

---

## HTML mockup template

`docs/design/screens/{kebab-name}.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{Screen Name} — Preview</title>
  <link rel="stylesheet" href="_theme.css">
  <style>
    /* screen-specific overrides only — shared look lives in _theme.css */
  </style>
</head>
<body>
  <div class="review-bar">
    <span>{Screen Name}</span>
    <span>Phase {N}</span>
    <a href="index.html">← All screens</a>
  </div>
  <main>
    <!-- Real tokens from DESIGN.md, real layout — not gray wireframe boxes -->
  </main>
</body>
</html>
```

`_theme.css` should define CSS custom properties matching the DESIGN.md YAML `colors`/`typography`/`spacing`/`rounded` tokens exactly, plus base styles for whatever components appear across mockups (buttons, cards, inputs, nav). Every screen mockup imports this one file — no per-screen token redefinition.

`index.html` is a simple list of links to every screen mockup, grouped by phase, styled with the same `_theme.css`.

---

## Design.md spec compliance checklist

- [ ] YAML front matter parses as valid YAML
- [ ] `name` and `version` present
- [ ] `colors`, `typography`, `spacing`, `rounded` token groups all present
- [ ] `components` has at minimum a primary button and one input definition
- [ ] Body has all eight sections in order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts
- [ ] Every color token referenced in prose exists in the YAML front matter (no orphan references)
- [ ] No token value appears only in prose without a corresponding YAML entry

If `npx @google/design.md lint` isn't available in this environment, walk this checklist manually before treating DESIGN.md as locked.
