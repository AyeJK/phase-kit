/**
 * Task progress: counts per sprint, per phase and overall, plus the Overview's
 * "Next up", "Blocked" and "Deferred or cut" answers. Pure and never throws.
 *
 * Rules:
 *
 * - Every task counts in `total` and `byStatus`.
 * - `cut` and `deferred` tasks are not eligible: `eligible = total - cut - deferred`,
 *   and `percent = round(done / eligible * 100)` (`0` when nothing is eligible).
 *   `blocked`, `manual` and `unknown` tasks are eligible and not done.
 * - Next up: the first sprint with a `todo` or `active` task, walking phases
 *   by ascending number and sprints in file order.
 * - Blocked: every `blocked` task, in the same order.
 */
import {
  TASK_STATUSES,
  type BlockedTask,
  type NextUp,
  type Phase,
  type Progress,
  type ProjectProgress,
  type Task,
  type TaskStatus,
} from '../model.js';

/** Statuses left out of the denominator. */
const NOT_ELIGIBLE: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['cut', 'deferred']);

/** Statuses that make a sprint "next up". */
const OPEN: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['todo', 'active']);

/** A zero count for every status. */
function zeroByStatus(): Record<TaskStatus, number> {
  return Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
}

/** {@link Progress} for any list of tasks. */
export function taskProgress(tasks: readonly Task[]): Progress {
  const byStatus = zeroByStatus();
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const total = tasks.length;
  let excluded = 0;
  for (const s of NOT_ELIGIBLE) excluded += byStatus[s];
  const eligible = total - excluded;
  const done = byStatus.done;
  const percent = eligible > 0 ? Math.round((done / eligible) * 100) : 0;
  return { total, eligible, done, percent, byStatus };
}

/**
 * Progress at every level for a list of phases.
 *
 * @param phases Parsed phases; walked by ascending phase number for next-up
 *   and blocked order (the input order is not changed).
 */
export function deriveProgress(phases: readonly Phase[]): ProjectProgress {
  const ordered = [...phases].sort((a, b) => a.number - b.number);
  const byPhase: Record<string, Progress> = {};
  const bySprint: Record<string, Progress> = {};
  const allTasks: Task[] = [];
  const blocked: BlockedTask[] = [];
  let nextUp: NextUp | null = null;

  // Two files with the same phase number share one entry.
  const tasksByPhase = new Map<string, Task[]>();

  for (const phase of ordered) {
    const key = String(phase.number);
    let phaseTasks = tasksByPhase.get(key);
    if (!phaseTasks) tasksByPhase.set(key, (phaseTasks = []));
    for (const sprint of phase.sprints) {
      phaseTasks.push(...sprint.tasks);
      allTasks.push(...sprint.tasks);
      bySprint[sprint.id] = taskProgress(sprint.tasks);
      if (nextUp === null && sprint.tasks.some((t) => OPEN.has(t.status))) {
        nextUp = { phase: phase.number, sprint: sprint.id, title: sprint.title };
      }
      for (const t of sprint.tasks) {
        if (t.status !== 'blocked') continue;
        blocked.push({
          phase: phase.number,
          sprint: sprint.id,
          number: t.number,
          text: t.text,
          file: phase.file,
          line: t.line,
        });
      }
    }
  }
  for (const [key, tasks] of tasksByPhase) byPhase[key] = taskProgress(tasks);

  const overall = taskProgress(allTasks);
  return {
    overall,
    byPhase,
    bySprint,
    nextUp,
    blocked,
    deferred: overall.byStatus.deferred,
    cut: overall.byStatus.cut,
  };
}
