/**
 * Folding the server's event stream into one {@link ViewerSnapshot}.
 *
 * Pure functions, no DOM: `useProjectStream` calls them, and unit tests run
 * them in Node against real fixture projects. The event shapes are the
 * server's own (`shared/protocol.ts`): a `snapshot` replaces everything, and
 * each update event replaces one keyed piece of it (phases and run logs are
 * keyed by `file`).
 */
import type { Phase, PhaseRuns, Project } from '../../core/model.js';
import { SSE_EVENTS, type StateUpdate, type ViewerSnapshot } from '../../shared/protocol.js';

/** The update event names: every stream event except `snapshot`. */
export const UPDATE_EVENTS = SSE_EVENTS.filter(
  (name): name is StateUpdate['type'] => name !== 'snapshot',
) as readonly StateUpdate['type'][];

/**
 * The snapshot after one update. A snapshot without a project (no resolved
 * workspace) has nothing to update and comes back unchanged.
 */
export function applyUpdate(snapshot: ViewerSnapshot, update: StateUpdate): ViewerSnapshot {
  if (!snapshot.project) return snapshot;
  return { ...snapshot, project: applyToProject(snapshot.project, update) };
}

/** The project after one update. Never mutates its input. */
export function applyToProject(project: Project, update: StateUpdate): Project {
  switch (update.type) {
    case 'phase':
      return { ...project, phases: upsertPhase(project.phases, update.phase), progress: update.progress };
    case 'run':
      return { ...project, runs: upsertRuns(project.runs, update.runs) };
    case 'removed':
      return update.kind === 'phase'
        ? { ...project, phases: project.phases.filter((p) => p.file !== update.file), progress: update.progress }
        : { ...project, runs: project.runs.filter((r) => r.file !== update.file), progress: update.progress };
    case 'warnings':
      return { ...project, warnings: update.warnings };
    case 'design':
      return { ...project, hasDesignSystem: update.hasDesignSystem };
    default:
      return project;
  }
}

/** Replace the phase with the same file, or add it; sorted by number, then file name (as the server sorts). */
function upsertPhase(phases: readonly Phase[], phase: Phase): Phase[] {
  return [...phases.filter((p) => p.file !== phase.file), phase].sort(
    (a, b) => a.number - b.number || baseName(a.file).localeCompare(baseName(b.file)),
  );
}

/** Replace the run log with the same file, or add it; sorted by phase number. */
function upsertRuns(runs: readonly PhaseRuns[], next: PhaseRuns): PhaseRuns[] {
  return [...runs.filter((r) => r.file !== next.file), next].sort((a, b) => a.phase - b.phase);
}

/** Last segment of a path with either separator. */
export function baseName(file: string): string {
  const parts = file.split(/[\\/]/).filter((s) => s !== '');
  return parts[parts.length - 1] ?? file;
}

// ---------------------------------------------------------------------------
// Parsing event data
// ---------------------------------------------------------------------------

const UPDATE_TYPES: ReadonlySet<string> = new Set(UPDATE_EVENTS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A `snapshot` event's data, or `null` when it isn't JSON of that shape. */
export function parseSnapshot(data: string): ViewerSnapshot | null {
  const value = parseJson(data);
  if (!isObject(value) || !isObject(value.workspace) || typeof value.workspace.kind !== 'string') return null;
  if (value.project !== null && !(isObject(value.project) && Array.isArray(value.project.phases))) return null;
  return value as unknown as ViewerSnapshot;
}

/** An update event's data, or `null` when it isn't JSON with a known `type`. */
export function parseUpdate(data: string): StateUpdate | null {
  const value = parseJson(data);
  if (!isObject(value) || typeof value.type !== 'string' || !UPDATE_TYPES.has(value.type)) return null;
  return value as unknown as StateUpdate;
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}
