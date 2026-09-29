/**
 * Derived answers the rail asks of the model: the phase's status badge
 * (design-system.md "Badges and tags", "Slide-in panel"), task-row icons and
 * status words, and a sprint's task count. Pure, no DOM.
 *
 * Phase badge: blocked tasks ("N tasks blocked"), then an open escalation
 * ("Needs you", pink `needs`), then a manual task left in a started sprint
 * ("Needs you", violet `manual`; pink wins when both apply), then every
 * eligible task done ("Complete"), then a running
 * sprint ("Running · wave 1 of 2", from the wave count in `live/derive.ts`),
 * else a plain tag: "Not started" (nothing done), "Waiting" (some tasks
 * done), "Deferred" / "Cut" (nothing eligible).
 */
import type { Phase, Progress, Project, Task, TaskStatus } from '../../core/model.js';
import type { IconKind } from '../components/iconKind.js';
import { phaseRuns, projectSprintStatus } from '../data/status.js';
import { plural } from '../format.js';
import { liveView } from '../live/derive.js';

/** A status badge (`.status.{kind}`) or a plain tag (`.tag`). */
export type BadgeView =
  | { kind: 'pass' | 'run' | 'needs' | 'manual' | 'fail'; text: string }
  | { kind: 'tag'; text: string };

/** The plain tag for something that isn't complete, running or blocked. */
function idleTag(progress: Progress | undefined): BadgeView {
  if (progress && progress.total > 0 && progress.eligible === 0) {
    return { kind: 'tag', text: progress.byStatus.cut === progress.total ? 'Cut' : 'Deferred' };
  }
  return { kind: 'tag', text: (progress?.done ?? 0) > 0 ? 'Waiting' : 'Not started' };
}

function blockedText(n: number): string {
  return `${plural(n, 'task')} blocked`;
}

/** See the module comment. */
export function phaseBadge(project: Project, phase: Phase): BadgeView {
  const progress = project.progress.byPhase[String(phase.number)];
  const blocked = progress?.byStatus.blocked ?? 0;
  if (blocked > 0) return { kind: 'needs', text: blockedText(blocked) };
  const runs = phaseRuns(project, phase.number);
  if (runs && runs.escalations.length > 0) return { kind: 'needs', text: 'Needs you' };
  const statuses = phase.sprints.map((s) => projectSprintStatus(project, s));
  // A sprint's own escalation (pink), then a manual task left in a started sprint (violet): data/status.ts.
  if (statuses.includes('needs')) return { kind: 'needs', text: 'Needs you' };
  if (statuses.includes('manual')) return { kind: 'manual', text: 'Needs you' };
  if (progress && progress.eligible > 0 && progress.done === progress.eligible) return { kind: 'pass', text: 'Complete' };
  if (statuses.includes('running')) {
    const view = liveView(project, phase);
    return {
      kind: 'run',
      text: view.current !== null ? `Running · wave ${view.current} of ${view.total}` : 'Running',
    };
  }
  return idleTag(progress);
}

/** Task-row icon (design-system.md "Tasks table"). */
export function taskIcon(status: TaskStatus): IconKind {
  switch (status) {
    case 'done':
      return 'pass';
    case 'active':
      return 'run';
    case 'blocked':
      return 'needs';
    case 'manual':
      return 'manual';
    default:
      return 'wait';
  }
}

/** The status word shown beside a task row's icon. */
export function taskStatusWords(task: Pick<Task, 'status' | 'rawStatus'>): string {
  switch (task.status) {
    case 'done':
      return 'Complete';
    case 'active':
      return 'Running';
    case 'blocked':
      return 'Blocked';
    case 'manual':
      return 'Manual';
    case 'cut':
      return 'Cut';
    case 'deferred':
      return 'Deferred';
    case 'todo':
      return 'Not started';
    case 'unknown':
      return task.rawStatus ? `Status ${task.rawStatus}` : 'Unknown status';
  }
}

/** "5/5": done over eligible, for a sprint's task count. */
export function doneOfEligible(progress: Progress | undefined): string {
  return `${progress?.done ?? 0}/${progress?.eligible ?? 0}`;
}
