/**
 * Incremental project state: the server's in-memory {@link Project}, kept
 * current one file change at a time.
 *
 * `createProjectState(root)` reads the project once, the same way
 * `loadProject` does. After that, `apply({ kind, file })` re-reads only the
 * changed file, rebuilds the cross-file parts in memory (phase-number and
 * dependency warnings, run derivations when the set of `ui:` sprints moved,
 * progress, the warning list), and returns the updates a client needs:
 *
 * | Update     | When |
 * |------------|------|
 * | `phase`    | A phase file was added or its parsed {@link Phase} changed. Carries the new project progress. |
 * | `run`      | A run log was added, or its events or derivation changed (an append, or a phase edit that changed which sprints run a wave test). |
 * | `removed`  | A phase file or run log is gone. Carries the new project progress. |
 * | `warnings` | The project's warning list changed. Carries the whole list. |
 * | `design`   | `docs/design/design-system.md` appeared or disappeared. |
 *
 * Content that re-reads to the same data yields no update, so duplicate
 * watcher events cost nothing. Delete vs change is decided when the change is
 * applied: a file that isn't there any more is removed.
 *
 * Independent of the file watcher (`watch.ts`): anything that can say "this
 * file changed" can drive it. Changes are applied one at a time in call
 * order, so concurrent `apply` calls never interleave.
 *
 * Read-only: `readdir`, `stat` and `readFile` only. Never rejects; a read
 * problem becomes a {@link Warning}, like the loader's.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Phase, PhaseRuns, Project, Warning } from '../core/model.js';
import type { StateUpdate } from '../shared/protocol.js';
import { deriveProgress } from '../core/derive/progress.js';
import { deriveRun } from '../core/derive/run.js';
import {
  checkDependencies,
  checkPhaseNumbers,
  loadPhaseFile,
  loadRunLog,
  phaseFileNumber,
  uiSprintIds,
  type LoadedPhase,
} from '../core/load.js';
import { findRunLogs, RUNS_DIR_NAME, runLogPhase } from '../core/runlog/find.js';

/** What changed on disk: a phase file, a run log, or anything under `docs/design/`. */
export type ChangeKind = 'phase' | 'run' | 'design';

/** One file change, as the watcher reports it. */
export interface FileChange {
  kind: ChangeKind;
  /** Path of the changed file (resolved to an absolute path before use). */
  file: string;
}

// The update shapes are part of the client protocol, so they live in the
// Node-free `shared/protocol.ts`; re-exported here for server code and tests.
export type {
  DesignUpdate,
  PhaseUpdate,
  RemovedUpdate,
  RunUpdate,
  StateUpdate,
  WarningsUpdate,
} from '../shared/protocol.js';

/** The live project model. */
export interface ProjectState {
  /** Absolute project folder. */
  readonly root: string;
  /** The current {@link Project}, equal to what `loadProject(root)` would return now. Don't mutate it. */
  snapshot(): Project;
  /**
   * Re-read one changed file and return what changed, in this order: phase
   * updates and removals, run updates and removals, design, warnings. Empty
   * when nothing visible changed or the file isn't one the model reads.
   */
  apply(change: FileChange): Promise<StateUpdate[]>;
}

/** A cached run log: its derived runs plus the reader's warnings. */
interface LoadedRunLog {
  runs: PhaseRuns;
  warnings: Warning[];
}

/**
 * Read a project folder into a {@link ProjectState}.
 *
 * @param root The project folder (the one holding `docs/phases/`); resolved
 *   to an absolute path.
 */
export async function createProjectState(root: string): Promise<ProjectState> {
  const absRoot = path.resolve(root);
  const phasesDir = path.join(absRoot, 'docs', 'phases');
  const runsDir = path.join(phasesDir, RUNS_DIR_NAME);
  const designSystemFile = path.join(absRoot, 'docs', 'design', 'design-system.md');

  /** Phase files by absolute path, with parser warnings only (cross-file checks run on copies). */
  const phases = new Map<string, LoadedPhase>();
  /** Run logs by absolute path. */
  const runLogs = new Map<string, LoadedRunLog>();
  /** The loader's "no docs/phases/ folder" warning, while it applies. */
  let dirWarning: Warning | null = null;
  let hasDesignSystem = false;
  /** `uiSprints` the cached run derivations were made with. */
  let uiSprints: string[] = [];

  /** What clients last saw, for change detection. */
  const phaseJson = new Map<string, string>();
  const phaseNumber = new Map<string, number>();
  const runJson = new Map<string, string>();
  let warningsJson = '[]';
  let queue: Promise<unknown> = Promise.resolve();

  // Initial load, mirroring loadProject.
  try {
    hasDesignSystem = await isFile(designSystemFile);
    let names: string[] | null = null;
    try {
      names = await readdir(phasesDir);
    } catch (err) {
      dirWarning = {
        file: phasesDir,
        line: 0,
        raw: '',
        message: `No docs/phases/ folder to read (${errorCode(err)}); the project has no phase plans`,
      };
    }
    if (names) {
      for (const name of names) {
        const n = phaseFileNumber(name);
        if (n === null) continue;
        const file = path.join(phasesDir, name);
        if (await isFile(file)) phases.set(file, await loadPhaseFile(file, n));
      }
      uiSprints = uiSprintIds([...phases.values()].map((l) => l.phase));
      for (const log of await findRunLogs(phasesDir)) {
        runLogs.set(log.file, await loadRunLog(log.file, log.phase, uiSprints));
      }
    }
  } catch (err) {
    dirWarning = {
      file: phasesDir,
      line: 0,
      raw: '',
      message: `Could not finish loading the project: ${errorMessage(err)}; returning what loaded so far`,
    };
  }
  let project = assemble();
  for (const phase of project.phases) remember(phase);
  for (const runs of project.runs) runJson.set(runs.file, JSON.stringify(runs));
  warningsJson = JSON.stringify(project.warnings);

  /** Rebuild the {@link Project} from the per-file caches, as loadProject orders it. */
  function assemble(): Project {
    const loaded = [...phases.values()]
      .map((l) => ({ ...l, warnings: [...l.warnings] }))
      .sort((a, b) => a.fileNumber - b.fileNumber || path.basename(a.phase.file).localeCompare(path.basename(b.phase.file)))
      .sort((a, b) => a.phase.number - b.phase.number);
    checkPhaseNumbers(loaded);
    checkDependencies(loaded);

    const warnings: Warning[] = dirWarning ? [dirWarning] : [];
    for (const l of loaded) {
      l.warnings.sort((a, b) => a.line - b.line);
      warnings.push(...l.warnings);
    }
    const logs = [...runLogs.values()].sort((a, b) => a.runs.phase - b.runs.phase);
    for (const log of logs) warnings.push(...log.warnings);

    const phaseList = loaded.map((l) => l.phase);
    return {
      root: absRoot,
      phasesDir,
      phases: phaseList,
      runs: logs.map((log) => log.runs),
      hasDesignSystem,
      progress: deriveProgress(phaseList),
      warnings,
    };
  }

  function remember(phase: Phase): void {
    phaseJson.set(phase.file, JSON.stringify(phase));
    phaseNumber.set(phase.file, phase.number);
  }

  /** Re-read one file into the caches. Returns which cache entries it touched. */
  async function reread(change: FileChange): Promise<{ phaseFile?: string; runFile?: string }> {
    const file = path.resolve(change.file);
    const dir = path.dirname(file);
    const name = path.basename(file);

    if (change.kind === 'phase') {
      const n = phaseFileNumber(name);
      if (n === null || dir !== phasesDir) return {};
      if (await isFile(file)) {
        phases.set(file, await loadPhaseFile(file, n));
        dirWarning = null;
      } else {
        phases.delete(file);
      }
      return { phaseFile: file };
    }

    if (change.kind === 'run') {
      const n = runLogPhase(name);
      if (n === null || dir !== runsDir) return {};
      if (await isFile(file)) {
        runLogs.set(file, await loadRunLog(file, n, uiSprints));
        dirWarning = null;
      } else {
        runLogs.delete(file);
      }
      return { runFile: file };
    }

    if (change.kind === 'design') {
      hasDesignSystem = await isFile(designSystemFile);
    }
    return {};
  }

  /** Apply one change and diff the result against what clients last saw. */
  async function applyNow(change: FileChange): Promise<StateUpdate[]> {
    try {
      const touched = await reread(change);

      // A phase edit can change which sprints run a wave test; re-derive every
      // cached log when it does (from cached events, no re-read).
      let rederived = false;
      if (touched.phaseFile !== undefined) {
        const next = uiSprintIds([...phases.values()].map((l) => l.phase));
        if (JSON.stringify(next) !== JSON.stringify(uiSprints)) {
          uiSprints = next;
          for (const log of runLogs.values()) {
            log.runs = { ...log.runs, ...deriveRun(log.runs.events, { uiSprints }) };
          }
          rederived = true;
        }
      }

      const previous = project;
      project = assemble();
      const updates: StateUpdate[] = [];

      // Phases.
      if (touched.phaseFile !== undefined) {
        const file = touched.phaseFile;
        const phase = project.phases.find((p) => p.file === file);
        if (phase) {
          const json = JSON.stringify(phase);
          if (phaseJson.get(file) !== json) {
            remember(phase);
            updates.push({ type: 'phase', file, phase, progress: project.progress });
          }
        } else if (phaseJson.has(file)) {
          const number = phaseNumber.get(file) ?? phaseFileNumber(path.basename(file)) ?? 0;
          phaseJson.delete(file);
          phaseNumber.delete(file);
          updates.push({ type: 'removed', kind: 'phase', file, number, progress: project.progress });
        }
      }

      // Run logs.
      const runFiles = rederived
        ? new Set([...runJson.keys(), ...project.runs.map((r) => r.file)])
        : new Set(touched.runFile !== undefined ? [touched.runFile] : []);
      for (const file of runFiles) {
        const runs = project.runs.find((r) => r.file === file);
        if (runs) {
          const json = JSON.stringify(runs);
          if (runJson.get(file) !== json) {
            runJson.set(file, json);
            updates.push({ type: 'run', file, runs });
          }
        } else if (runJson.has(file)) {
          runJson.delete(file);
          const number = runLogPhase(path.basename(file)) ?? 0;
          updates.push({ type: 'removed', kind: 'run', file, number, progress: project.progress });
        }
      }

      // Design system.
      if (project.hasDesignSystem !== previous.hasDesignSystem) {
        updates.push({ type: 'design', hasDesignSystem: project.hasDesignSystem });
      }

      // Warnings.
      const json = JSON.stringify(project.warnings);
      if (json !== warningsJson) {
        warningsJson = json;
        updates.push({ type: 'warnings', warnings: project.warnings });
      }

      return updates;
    } catch {
      // Every read above already turns failures into warnings; this only guards
      // against the unexpected, and the next change re-syncs.
      return [];
    }
  }

  return {
    root: absRoot,
    snapshot: () => project,
    apply(change: FileChange): Promise<StateUpdate[]> {
      const result = queue.then(() => applyNow(change));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

/** `true` when the path is a regular file; `false` on any error. */
async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** A short code for an fs error (`ENOENT`, `ENOTDIR`, …), else its message. */
function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') return err.code;
  return errorMessage(err);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
