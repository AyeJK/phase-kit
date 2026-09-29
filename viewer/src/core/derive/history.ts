/**
 * Sprint history: everything the run log says about one sprint, for the
 * Sprint detail page's Run history timeline and Files changed card. Pure and
 * never throws.
 *
 * Module matching: a file is "under" a Module path when it equals the path or
 * sits inside it as a folder (`src/core/` or `src/core` both match
 * `src/core/load.ts`). Paths are compared after turning `\` into `/` and
 * dropping a leading `./`, surrounding backticks and a trailing `/`. A Module
 * cell holding several comma-separated paths contributes each of them.
 */
import type {
  HistoryStep,
  Phase,
  PhaseRuns,
  Project,
  Sprint,
  SprintHistory,
  SprintWaveHistory,
  WaveRun,
} from '../model.js';

/**
 * The sprint's steps across every run and wave, plus the files each wave
 * changed with the sprint's own Module files first.
 *
 * @returns `null` when the sprint's phase has no run log. When the log exists
 *   but never mentions the sprint, a history with no waves.
 */
export function sprintHistory(project: Project, sprintId: string): SprintHistory | null {
  const sprint = findSprint(project.phases, sprintId);
  const phaseNumber = sprint?.phase ?? phaseOfId(sprintId);
  if (phaseNumber === null) return null;
  const runs: PhaseRuns | undefined = project.runs.find((r) => r.phase === phaseNumber);
  if (!runs) return null;

  const modules = sprint ? modulePaths(sprint) : [];
  const waves: SprintWaveHistory[] = [];
  const steps: HistoryStep[] = [];

  for (const sr of runs.sprintHistory[sprintId] ?? []) {
    const wave = runs.waves.find((w) => w.run === sr.run && w.wave === sr.wave);
    const { files, moduleFiles } = orderFiles(wave?.files ?? sr.files, modules);
    waves.push({
      run: sr.run,
      wave: sr.wave,
      state: sr.state,
      steps: sr.steps,
      escalation: sr.escalation,
      files,
      moduleFiles,
      filesAt: wave ? filesAt(wave) : null,
      startedAt: sr.startedAt,
      updatedAt: sr.updatedAt,
    });
    for (const step of sr.steps) steps.push({ ...step, run: sr.run, wave: sr.wave });
  }

  return { sprint: sprintId, phase: phaseNumber, file: runs.file, waves, steps };
}

/** The sprint with this id in any phase, or `undefined`. */
function findSprint(phases: readonly Phase[], id: string): Sprint | undefined {
  for (const phase of phases) {
    const s = phase.sprints.find((sp) => sp.id === id);
    if (s) return s;
  }
  return undefined;
}

/** The phase number an `N.M` id implies, or `null`. */
function phaseOfId(id: string): number | null {
  const m = /^(\d+)\.\d+$/.exec(id.trim());
  return m?.[1] ? Number(m[1]) : null;
}

/** Normalize a path for prefix comparison. */
export function normalizePath(p: string): string {
  let s = p.trim().replace(/^`+|`+$/g, '').trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** Distinct, normalized Module paths of a sprint's tasks, in task order. */
export function modulePaths(sprint: Sprint): string[] {
  const out: string[] = [];
  for (const task of sprint.tasks) {
    if (!task.module) continue;
    for (const part of task.module.split(',')) {
      const p = normalizePath(part);
      if (p && p !== '/' && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** `true` when `file` equals one of `modules` or sits inside one as a folder. */
export function isUnderModules(file: string, modules: readonly string[]): boolean {
  const f = normalizePath(file);
  return modules.some((m) => f === m || f.startsWith(`${m}/`));
}

/** Module files first, then the rest, each group in logged order. */
function orderFiles(
  files: string[] | null,
  modules: readonly string[],
): { files: string[] | null; moduleFiles: string[] } {
  if (files === null) return { files: null, moduleFiles: [] };
  const own: string[] = [];
  const rest: string[] = [];
  for (const f of files) (isUnderModules(f, modules) ? own : rest).push(f);
  return { files: [...own, ...rest], moduleFiles: own };
}

/** `ts` of the wave's latest `doc_sync` event that carried `files`. */
function filesAt(wave: WaveRun): string | null {
  for (let i = wave.events.length - 1; i >= 0; i--) {
    const e = wave.events[i]!;
    if (e.gate === 'doc_sync' && e.files) return e.ts;
  }
  return null;
}
