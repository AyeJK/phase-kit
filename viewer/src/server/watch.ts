/**
 * File watcher: turns disk activity in a project's `docs/` folder into one
 * {@link FileChange} per settled file.
 *
 * Watched (chokidar v4, one watcher on `{root}/docs/`):
 *
 * - `docs/phases/Phase-{N}….md` → `{ kind: 'phase', file }`
 * - `docs/phases/.runs/phase-{N}.jsonl` → `{ kind: 'run', file }`
 * - any file under `docs/design/` → `{ kind: 'design', file }`
 *
 * Everything else under `docs/` is ignored and never traversed.
 *
 * Windows file watching sends duplicate events, and editors often save by
 * replacing the file (unlink, then add). So every add, change or unlink only
 * (re)starts a per-file timer; when the file has been quiet for
 * `debounceMs` (~100 ms) one change is reported. Whether the file still
 * exists is decided by whoever applies the change, after the timer fires
 * (`state.ts` re-reads the whole file, or treats it as removed when it is
 * gone), so a replace-save inside the window is one change, never a removal
 * plus an add.
 *
 * Read-only: the watcher never writes inside the watched project.
 */
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { phaseFileNumber } from '../core/load.js';
import { RUNS_DIR_NAME, runLogPhase } from '../core/runlog/find.js';
import type { ChangeKind, FileChange } from './state.js';

export type { ChangeKind, FileChange } from './state.js';

/** Quiet time per file before a change is reported. */
export const DEFAULT_DEBOUNCE_MS = 100;

/** Options for {@link watchProject}. */
export interface WatchOptions {
  /** Quiet time per file before its change is reported. Default {@link DEFAULT_DEBOUNCE_MS}. */
  debounceMs?: number;
  /** Called with watcher errors (e.g. a permission error). Default: ignored. */
  onError?: (err: Error) => void;
  /** Poll instead of using native events (for network drives). Default `false`. */
  usePolling?: boolean;
}

/** A running watcher. */
export interface ProjectWatcher {
  /** Resolves once the initial scan is done and changes are being reported (or on close). */
  readonly ready: Promise<void>;
  /** Stop watching and drop pending changes. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Which kind of change a path under a project is, or `null` when the viewer
 * doesn't read it.
 *
 * @param root The project folder.
 * @param file Any path (absolute, or relative to the working directory).
 */
export function classifyPath(root: string, file: string): ChangeKind | null {
  const parts = docsParts(root, file);
  if (!parts || parts.length < 2) return null;
  const [top, second, third] = parts;
  if (top === 'phases') {
    if (parts.length === 2 && second !== undefined) return phaseFileNumber(second) !== null ? 'phase' : null;
    if (parts.length === 3 && second === RUNS_DIR_NAME && third !== undefined) {
      return runLogPhase(third) !== null ? 'run' : null;
    }
    return null;
  }
  if (top === 'design') return 'design';
  return null;
}

/**
 * `true` for paths the watcher must traverse or report: `docs/` itself,
 * `docs/phases/`, `docs/phases/.runs/`, phase files, run logs and everything
 * under `docs/design/`.
 */
function isWatched(root: string, file: string): boolean {
  const parts = docsParts(root, file);
  if (!parts) return false;
  if (parts.length === 0) return true;
  const [top, second] = parts;
  if (top === 'phases') {
    if (parts.length === 1) return true;
    if (parts.length === 2 && second === RUNS_DIR_NAME) return true;
    return classifyPath(root, file) !== null;
  }
  return top === 'design';
}

/** Path segments below `{root}/docs/`; `[]` for `docs/` itself, `null` outside it. */
function docsParts(root: string, file: string): string[] | null {
  const rel = path.relative(path.join(path.resolve(root), 'docs'), path.resolve(file));
  if (rel === '') return [];
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(/[\\/]+/).filter((p) => p !== '');
}

/**
 * Watch a project's phase files, run logs and design docs.
 *
 * @param root The project folder (the one holding `docs/phases/`).
 * @param onChange Called once per settled file change. Exceptions it throws
 *   are passed to `onError`, never to chokidar.
 */
export function watchProject(
  root: string,
  onChange: (change: FileChange) => void,
  options: WatchOptions = {},
): ProjectWatcher {
  const absRoot = path.resolve(root);
  const docsDir = path.join(absRoot, 'docs');
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onError = options.onError ?? (() => undefined);
  const timers = new Map<string, NodeJS.Timeout>();
  let closed = false;

  const watcher: FSWatcher = watch(docsDir, {
    ignoreInitial: true,
    persistent: true,
    usePolling: options.usePolling ?? false,
    ignored: (p: string) => !isWatched(absRoot, p),
  });

  const schedule = (raw: string): void => {
    if (closed) return;
    const file = path.resolve(raw);
    const kind = classifyPath(absRoot, file);
    if (kind === null) return;
    const pending = timers.get(file);
    if (pending) clearTimeout(pending);
    timers.set(
      file,
      setTimeout(() => {
        timers.delete(file);
        if (closed) return;
        try {
          onChange({ kind, file });
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }, debounceMs),
    );
  };

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('error', (err) => onError(err instanceof Error ? err : new Error(String(err))));

  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  watcher.once('ready', () => resolveReady());

  return {
    ready,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      resolveReady();
      await watcher.close();
    },
  };
}
