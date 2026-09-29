/**
 * Derived answers the views ask of a {@link Project}: a sprint's status (the
 * base the rail's card states build on), which phase to select by default,
 * and phase labels.
 *
 * Pure functions, no DOM, so unit tests run them in Node against fixtures.
 *
 * Sprint status:
 *
 * | Status     | When |
 * |------------|------|
 * | `needs`    | A task is `blocked`, or the sprint's latest wave ended in an escalation |
 * | `manual`   | Not `needs`, and a `manual` task is left in a started sprint |
 * | `complete` | Every eligible task is done (cut and deferred left out) |
 * | `running`  | The sprint is in the phase's latest run and its latest wave isn't `done` yet, or a task is `active` (`~`) |
 * | `waiting`  | Anything else |
 *
 * `needs` and `manual` both read "Needs you"; `needs` is pink, `manual`
 * violet. Blocked wins: a sprint with a blocked task and a manual one is
 * `needs`.
 *
 * A sprint has started once a task is done or active (`~`), or the run log
 * has events for it. A `manual` task in a sprint that hasn't started doesn't
 * make it `manual`, so planned sprints with a manual step stay quiet.
 *
 * The viewer doesn't guess whether a run was stopped: a sprint whose latest
 * gate failed stays `running` until something newer is logged, as the model's
 * `failed` state does (see `SprintRunState`).
 */
import type { Phase, PhaseRuns, Progress, Project, Sprint, SprintRun } from '../../core/model.js';

/** A sprint's status. See the module comment. */
export type SprintStatus = 'running' | 'complete' | 'needs' | 'manual' | 'waiting';

/** The run-log data for a phase, or `null` when it has no run log. */
export function phaseRuns(project: Project, phase: number): PhaseRuns | null {
  return project.runs.find((r) => r.phase === phase) ?? null;
}

/**
 * The sprint's latest {@link SprintRun} when it belongs to the phase's latest
 * run (a newer run that hasn't reached the sprint yet makes older waves
 * history, not status); otherwise `null`.
 */
export function currentSprintRun(runs: PhaseRuns | null, sprintId: string): SprintRun | null {
  if (!runs) return null;
  const history = runs.sprintHistory[sprintId] ?? [];
  const latest = history[history.length - 1];
  if (!latest) return null;
  const latestRun = runs.waves.reduce((max, w) => Math.max(max, w.run), 0);
  return latest.run === latestRun ? latest : null;
}

/** Whether the run log has any events for the sprint, in any run. */
export function sprintRan(runs: PhaseRuns | null, sprintId: string): boolean {
  return (runs?.sprintHistory[sprintId]?.length ?? 0) > 0;
}

/** A task done or active, or run events for the sprint. See the module comment. */
export function sprintStarted(progress: Progress | undefined, ran: boolean): boolean {
  return ran || (progress?.done ?? 0) > 0 || (progress?.byStatus.active ?? 0) > 0;
}

/**
 * See the module comment.
 *
 * @param ran Whether the run log has events for the sprint (see {@link sprintRan});
 *   defaults to whether it has a run in the phase's latest run.
 */
export function sprintStatus(
  sprint: Sprint,
  progress: Progress | undefined,
  run: SprintRun | null,
  ran: boolean = run !== null,
): SprintStatus {
  if ((progress?.byStatus.blocked ?? 0) > 0 || run?.escalation) return 'needs';
  if ((progress?.byStatus.manual ?? 0) > 0 && sprintStarted(progress, ran)) return 'manual';
  if (progress && progress.eligible > 0 && progress.done === progress.eligible) return 'complete';
  if (run && run.state !== 'done') return 'running';
  if ((progress?.byStatus.active ?? 0) > 0) return 'running';
  return 'waiting';
}

/** {@link sprintStatus} looked up from the project. */
export function projectSprintStatus(project: Project, sprint: Sprint): SprintStatus {
  const runs = phaseRuns(project, sprint.phase);
  return sprintStatus(
    sprint,
    project.progress.bySprint[sprint.id],
    currentSprintRun(runs, sprint.id),
    sprintRan(runs, sprint.id),
  );
}

/** The newest event time in one run log (ms since the epoch), or `null` when it has none. */
export function lastEventAt(runs: PhaseRuns): number | null {
  let latest: number | null = null;
  for (const event of runs.events) {
    const t = Date.parse(event.ts);
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

/**
 * The phase the list view selects when none is named (after a running
 * phase, `board/derive.ts`): the phase with the most recent run activity,
 * else the first phase with work left, else the first phase. `null` when
 * there are no phases.
 */
export function defaultPhase(project: Project): number | null {
  const numbers = new Set(project.phases.map((p) => p.number));
  let best: { phase: number; at: number } | null = null;
  for (const runs of project.runs) {
    if (!numbers.has(runs.phase)) continue;
    const at = lastEventAt(runs);
    if (at !== null && (best === null || at > best.at)) best = { phase: runs.phase, at };
  }
  if (best) return best.phase;

  const open = project.phases.find((p) => {
    const progress = project.progress.byPhase[String(p.number)];
    return progress !== undefined && progress.done < progress.eligible;
  });
  return (open ?? project.phases[0])?.number ?? null;
}

/** "Phase 2: Trip Journal", as column names, headings and the page title write it. */
export function phaseLabel(phase: Pick<Phase, 'number' | 'title'>): string {
  return phase.title === '' ? `Phase ${phase.number}` : `Phase ${phase.number}: ${phase.title}`;
}

/** The phase number a sprint id belongs to ("2.4" → 2), or `null` when the id has no number before the dot. */
export function phaseOfSprintId(id: string): number | null {
  const match = /^(\d+)\./.exec(id);
  return match ? Number(match[1]) : null;
}
