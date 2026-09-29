/**
 * The wire protocol between the viewer server and the browser client.
 *
 * Everything here is plain data with no Node imports, so the React client
 * (`src/client/`, type-checked against the DOM, not Node) can import these
 * types without pulling in `node:http` or `node:fs`. The server modules that
 * produce these values (`server/detect.ts`, `server/state.ts`,
 * `server/sse.ts`) re-export them, so server code and tests keep importing
 * them from where they always have.
 */
import type { Phase, PhaseRuns, Project, ProjectProgress, Warning } from '../core/model.js';

// ---------------------------------------------------------------------------
// Workspace (server/detect.ts)
// ---------------------------------------------------------------------------

/** Where a resolved root came from. */
export type WorkspaceSource = 'dir' | 'cwd' | 'parent' | 'child';

/** One project folder, resolved. */
export interface WorkspaceFound {
  kind: 'found';
  /** Absolute project folder (the one holding `docs/phases/`). */
  root: string;
  /** `dir` when `--dir` named it; otherwise the detection level that found it. */
  source: WorkspaceSource;
}

/** Several immediate subfolders hold `docs/phases/`; the user has to pick one. */
export interface WorkspaceCandidates {
  kind: 'candidates';
  /** Absolute project folders, sorted by subfolder name. Always two or more. */
  candidates: string[];
  /** Absolute folders searched, in search order (see {@link WorkspaceNone.searched}). */
  searched: string[];
}

/** No `docs/phases/` in the current folder, one level up, or one level down. */
export interface WorkspaceNone {
  kind: 'none';
  /**
   * Absolute folders searched, in search order: the current folder, its
   * parent (unless it's a filesystem root), then each immediate subfolder
   * sorted by name.
   */
  searched: string[];
}

/** What `detectWorkspace` (or `--dir`) settled on. */
export type Workspace = WorkspaceFound | WorkspaceCandidates | WorkspaceNone;

// ---------------------------------------------------------------------------
// State updates (server/state.ts)
// ---------------------------------------------------------------------------

/** A phase file was added or re-parsed to something different. */
export interface PhaseUpdate {
  type: 'phase';
  /** Absolute path of the phase file (same as `phase.file`). */
  file: string;
  phase: Phase;
  /** Project progress after the change. */
  progress: ProjectProgress;
}

/** A run log was added, appended to, or re-derived. */
export interface RunUpdate {
  type: 'run';
  /** Absolute path of the run log (same as `runs.file`). */
  file: string;
  runs: PhaseRuns;
}

/** A phase file or run log is gone. */
export interface RemovedUpdate {
  type: 'removed';
  kind: 'phase' | 'run';
  /** Absolute path of the file that was removed. */
  file: string;
  /** Phase number it held: the parsed header number for a phase file, the file-name number for a run log. */
  number: number;
  /** Project progress after the change. */
  progress: ProjectProgress;
}

/** The project's warning list changed. */
export interface WarningsUpdate {
  type: 'warnings';
  /** Every warning, in the same order as {@link Project.warnings}. */
  warnings: Warning[];
}

/** `docs/design/design-system.md` appeared or disappeared. */
export interface DesignUpdate {
  type: 'design';
  hasDesignSystem: boolean;
}

/** One update produced by `ProjectState.apply`. */
export type StateUpdate = PhaseUpdate | RunUpdate | RemovedUpdate | WarningsUpdate | DesignUpdate;

// ---------------------------------------------------------------------------
// Event stream (server/sse.ts)
// ---------------------------------------------------------------------------

/** Every event name `GET /api/events` sends. */
export const SSE_EVENTS = ['snapshot', 'phase', 'run', 'removed', 'warnings', 'design'] as const;

/** One event name. See {@link SSE_EVENTS}. */
export type SseEventName = (typeof SSE_EVENTS)[number];

/**
 * The whole model as the client sees it: the `snapshot` event's data and the
 * `GET /api/snapshot` body.
 */
export interface ViewerSnapshot {
  /**
   * How the project folder was settled (`--dir` or detection). When it isn't
   * `found`, the UI shows its empty or pick-a-folder state from this.
   */
  workspace: Workspace;
  /** The live project, or `null` when there is no resolved root. */
  project: Project | null;
}
