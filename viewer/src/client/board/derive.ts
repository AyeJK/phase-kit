/**
 * Kanban and list-view derivation: a {@link Project} in, what the phase
 * kanban's columns and the list view's phase rows draw out
 * (design-system.md "Phase kanban", "List view"). Pure (no DOM, no React).
 *
 * Tile states are the rail's sprint card states (`rail/derive.ts`), so a
 * sprint reads the same on the board and in its panel. Filter groups come
 * from `phaseGroup`.
 *
 * | Column treatment | When |
 * |------------------|------|
 * | Running | A sprint is in a gate state (Implementing, Verifying, Wave testing, Doc syncing) |
 * | Not started (dashed) | `phaseGroup` is `future` |
 * | Default | Otherwise. Pink (or manual violet) is never a whole column, only a Needs you tile |
 */
import type { Phase, Progress, Project } from '../../core/model.js';
import { defaultPhase, phaseLabel, phaseRuns } from '../data/status.js';
import { plural } from '../format.js';
import { phaseWarnings } from '../states/warnings.js';
import {
  phaseGroup,
  sprintCardState,
  SPRINT_STATE_TEXT,
  type PhaseFilter,
  type PhaseGroup,
  type SprintState,
} from '../rail/derive.js';

/** Card states drawn in the running style (a gate is next). */
const GATE_STATES: ReadonlySet<SprintState> = new Set<SprintState>([
  'implementing',
  'verifying',
  'wave-testing',
  'doc-syncing',
]);

/** A stretch phase keeps "(Stretch)" in its title as written in the file. */
export function isStretch(phase: Pick<Phase, 'title'>): boolean {
  return /\(stretch\)/i.test(phase.title);
}

/** Whether a sprint state is one of the gate (running) states. */
export function isGateState(state: SprintState): boolean {
  return GATE_STATES.has(state);
}

/** One sprint tile in a kanban column. */
export interface KanbanTile {
  id: string;
  title: string;
  state: SprintState;
  /** "Implementing", "Complete", … (sentence case). */
  stateText: string;
  /** In a gate state: the running border and a visible state badge. */
  running: boolean;
}

/** One phase: a kanban column, and a row of the list view's phase list. */
export interface KanbanColumn {
  number: number;
  /** Title as written ("" when the file has none). */
  title: string;
  /** "Phase 2: Core Model": the column link's accessible name. */
  label: string;
  group: PhaseGroup;
  /** A sprint is in a gate state. */
  running: boolean;
  done: number;
  eligible: number;
  /** "18/19 tasks": done over eligible, cut and deferred left out. */
  countText: string;
  /** The phase's task counts, for its status bar. */
  progress: Progress | undefined;
  /** Parse warnings on the phase file and its run log. */
  warnings: number;
  stretch: boolean;
  tiles: KanbanTile[];
}

/** A column for one phase. */
export function kanbanColumn(project: Project, phase: Phase): KanbanColumn {
  const progress = project.progress.byPhase[String(phase.number)];
  const done = progress?.done ?? 0;
  const eligible = progress?.eligible ?? 0;
  const tiles = phase.sprints.map((sprint): KanbanTile => {
    const state = sprintCardState(project, sprint);
    return { id: sprint.id, title: sprint.title, state, stateText: SPRINT_STATE_TEXT[state], running: GATE_STATES.has(state) };
  });
  return {
    number: phase.number,
    title: phase.title,
    label: phaseLabel(phase),
    group: phaseGroup(project, phase),
    running: tiles.some((t) => t.running),
    done,
    eligible,
    countText: `${done}/${plural(eligible, 'task')}`,
    progress,
    warnings: phaseWarnings(project.warnings, phase.file, phaseRuns(project, phase.number)?.file ?? null),
    stretch: isStretch(phase),
    tiles,
  };
}

/** Every phase's column, in phase order. */
export function kanbanColumns(project: Project): KanbanColumn[] {
  return project.phases.map((phase) => kanbanColumn(project, phase));
}

/** Whether a phase in `group` shows under `filter`. */
export function matchesFilter(group: PhaseGroup, filter: PhaseFilter): boolean {
  return filter === 'all' || filter === group;
}

/** The one line an empty filter shows in place of the board or phase list. */
export const EMPTY_FILTER_TEXT: Record<PhaseGroup, string> = {
  progress: 'No phases in progress',
  complete: 'No complete phases',
  future: 'No phases not started',
};

/** The first phase with a sprint in a gate state, or `null`. */
export function runningPhase(project: Project): number | null {
  const phase = project.phases.find((p) => p.sprints.some((s) => GATE_STATES.has(sprintCardState(project, s))));
  return phase?.number ?? null;
}

/**
 * The phase a view shows when the URL doesn't name one: the running phase,
 * else the default phase (most recent run activity, else the first with
 * work left). `null` when there are no phases.
 */
export function impliedPhase(project: Project): number | null {
  return runningPhase(project) ?? defaultPhase(project);
}
