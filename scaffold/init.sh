#!/usr/bin/env bash
# phase-kit init — scaffolds the docs/phases + docs/design convention into a project.
#
# Usage:
#   ./init.sh [target-dir]
#
# If target-dir is omitted, scaffolds into the current directory.

set -euo pipefail

TARGET="${1:-.}"
PHASES_DIR="$TARGET/docs/phases"
DESIGN_DIR="$TARGET/docs/design"
SCREENS_DIR="$DESIGN_DIR/screens"

mkdir -p "$PHASES_DIR" "$DESIGN_DIR" "$SCREENS_DIR"

# --- Starter Phase-1 file -----------------------------------------------
PHASE1="$PHASES_DIR/Phase-1-Foundation.md"
if [ -f "$PHASE1" ]; then
  echo "Skipping $PHASE1 (already exists)"
else
  cat > "$PHASE1" <<'EOF'
# Phase 1 — Foundation

{One-paragraph phase goal — what this phase delivers and why it's scoped this way.}

---

# Sprint 1.1 — {Sprint Title}

### Goal

{One sentence — what this sprint accomplishes.}

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | {task} | {path} |
| — | 2 | {task} | {path} |

### Acceptance Criteria

- {Observable, testable outcome}

### Dependencies

- None

### Verification

- cli: {your project's check/build/test command}
- skip-ui: true
EOF
  echo "Created $PHASE1"
fi

# --- Starter design-system.md -------------------------------------------
DS="$DESIGN_DIR/design-system.md"
if [ -f "$DS" ]; then
  echo "Skipping $DS (already exists)"
else
  cat > "$DS" <<'EOF'
# Design System

_Last updated: {date}. Linked from: DESIGN.md (once design-planner has run)._

This file is empty until a design pass runs (see the design-planner skill), or
until you fill it in by hand. phase-runner reads this path for UI sprints —
if it's empty or missing, UI implementation falls back to matching whatever
components already exist in the codebase.

## Design intent

{Fill in after a design pass, or describe your product's visual thesis here.}

## Design tokens

```css
:root {
  /* fill in once a direction is locked */
}
```

## Typography scale

| Element | Token |
|---|---|

## Core component patterns

## UI copy

## Screen index

| Surface | Spec | Route |
|---|---|---|
EOF
  echo "Created $DS"
fi

# --- .gitkeep for screens dir ---------------------------------------------
touch "$SCREENS_DIR/.gitkeep"

echo ""
echo "Scaffolded:"
echo "  $PHASES_DIR/"
echo "  $DESIGN_DIR/"
echo ""
echo "Next: run design-planner (optional, for UI-heavy projects) or start writing"
echo "sprints directly into $PHASE1 with the phase-planner skill."
