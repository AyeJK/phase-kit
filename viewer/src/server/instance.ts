/**
 * One viewer per project: the instance file.
 *
 * A server started for a project root writes `{ pid, port, root, version }`
 * to `{dir}/{key}.json`, where `dir` is `os.tmpdir()/phase-viewer/` (or
 * `$PHASE_VIEWER_INSTANCE_DIR`) and `key` is a hash of the root. The next
 * start for the same root reads that file and, when the server it names is
 * still alive and answers `/api/health` with the same root, reuses it instead
 * of starting a second one.
 *
 * A file whose process is dead, whose port doesn't answer, or whose port
 * answers for another root is stale: {@link findRunningInstance} deletes it
 * and the new server writes its own.
 *
 * Removal: {@link InstanceHandle.release} deletes the file (only while it
 * still names this process, so an old server never deletes its successor's
 * file). {@link releaseOnExit} calls it on `exit` and stops the server on
 * SIGINT, SIGTERM, SIGBREAK and SIGHUP. On Windows a hard kill
 * (`taskkill /F`, Task Manager, `child.kill()`) runs no handlers at all, so
 * the file stays behind; the stale check is what makes that harmless.
 *
 * Nothing here writes inside the project folder.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HOST } from './port.js';

/** Environment variable that overrides the instance folder (tests, sandboxes). */
export const INSTANCE_DIR_ENV = 'PHASE_VIEWER_INSTANCE_DIR';

/** How long {@link probeInstance} waits for `/api/health`. */
export const PROBE_TIMEOUT_MS = 1_000;

/** What the instance file holds. */
export interface InstanceInfo {
  /** Process id of the server. */
  pid: number;
  /** Port the server is bound to (on {@link HOST}). */
  port: number;
  /** Absolute project folder the server shows. */
  root: string;
  /** Package version of the server. */
  version: string;
}

/** A written instance file. */
export interface InstanceHandle {
  /** Path of the instance file. */
  readonly file: string;
  readonly info: InstanceInfo;
  /** Delete the file if it still names this instance. Synchronous (safe in an `exit` handler) and safe to call twice. */
  release(): void;
}

/** The instance folder: `$PHASE_VIEWER_INSTANCE_DIR`, else `os.tmpdir()/phase-viewer`. */
export function defaultInstanceDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[INSTANCE_DIR_ENV];
  return override !== undefined && override.trim() !== '' ? path.resolve(override) : path.join(tmpdir(), 'phase-viewer');
}

/**
 * A root in the form used for hashing and comparing: absolute, no trailing
 * separator, and lower-cased on Windows (whose paths are case-insensitive).
 */
export function normalizeRoot(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** `true` when two roots name the same folder (see {@link normalizeRoot}). */
export function sameRoot(a: string, b: string): boolean {
  return normalizeRoot(a) === normalizeRoot(b);
}

/** File name stem for a root: the first 16 hex digits of the SHA-256 of {@link normalizeRoot}. */
export function instanceKey(root: string): string {
  return createHash('sha256').update(normalizeRoot(root)).digest('hex').slice(0, 16);
}

/** Path of the instance file for `root`. */
export function instanceFile(root: string, dir: string = defaultInstanceDir()): string {
  return path.join(dir, `${instanceKey(root)}.json`);
}

/** The instance file for `root`, or `null` when it's missing, unreadable, or not a valid instance for this root. */
export function readInstance(root: string, dir: string = defaultInstanceDir()): InstanceInfo | null {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(instanceFile(root, dir), 'utf8'));
  } catch {
    return null;
  }
  const info = asInstanceInfo(data);
  return info !== null && sameRoot(info.root, root) ? info : null;
}

/**
 * Write the instance file for `info.root` (creating the folder) and return a
 * handle that removes it. The write goes to a temp file first and is renamed
 * into place, so a reader never sees half a file.
 */
export function writeInstance(info: InstanceInfo, dir: string = defaultInstanceDir()): InstanceHandle {
  const file = instanceFile(info.root, dir);
  mkdirSync(dir, { recursive: true });
  const temp = `${file}.${info.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(info)}\n`, 'utf8');
  try {
    renameSync(temp, file);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }

  let released = false;
  return {
    file,
    info,
    release() {
      if (released) return;
      released = true;
      const current = readInstance(info.root, dir);
      if (current !== null && (current.pid !== info.pid || current.port !== info.port)) return;
      try {
        rmSync(file, { force: true });
      } catch {
        // Nothing useful to do while exiting; the next start treats it as stale.
      }
    },
  };
}

/** Delete the instance file for `root`, whatever it holds. */
export function removeInstance(root: string, dir: string = defaultInstanceDir()): void {
  try {
    rmSync(instanceFile(root, dir), { force: true });
  } catch {
    // A file that can't be removed is overwritten by the next write.
  }
}

/**
 * Whether a process with this id exists. `process.kill(pid, 0)` sends no
 * signal; it throws `ESRCH` for a missing process and `EPERM` for one that
 * exists but belongs to someone else (alive).
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * `true` when `http://{HOST}:{port}/api/health` answers within `timeoutMs` as
 * a phase-viewer serving `info.root`.
 */
export async function probeInstance(info: InstanceInfo, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const res = await fetch(`http://${HOST}:${info.port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const health: unknown = await res.json();
    if (typeof health !== 'object' || health === null) return false;
    const { name, root } = health as { name?: unknown; root?: unknown };
    return name === 'phase-viewer' && typeof root === 'string' && sameRoot(root, info.root);
  } catch {
    return false;
  }
}

/**
 * The running instance for `root`, or `null`. A stale file (dead process, no
 * answer, or an answer for another root) is deleted on the way.
 */
export async function findRunningInstance(
  root: string,
  dir: string = defaultInstanceDir(),
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<InstanceInfo | null> {
  const info = readInstance(root, dir);
  if (info === null) {
    removeInstance(root, dir); // unreadable or foreign content: clear it
    return null;
  }
  if (isProcessAlive(info.pid) && (await probeInstance(info, timeoutMs))) return info;
  removeInstance(root, dir);
  return null;
}

/** Signals that stop the server. SIGBREAK is Ctrl+Break on Windows; SIGHUP is the console window closing. */
export const STOP_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'];

/**
 * Remove the instance file when this process ends: `release` on `exit`
 * (which runs after `process.exit()` and a normal exit), and `stop` on each of
 * {@link STOP_SIGNALS}. `stop` is expected to close the server and exit; the
 * `exit` hook then releases. Returns a function that removes the hooks.
 */
export function releaseOnExit(handle: Pick<InstanceHandle, 'release'>, stop: () => void): () => void {
  const onExit = () => handle.release();
  const onSignal = () => {
    handle.release();
    stop();
  };
  process.once('exit', onExit);
  for (const signal of STOP_SIGNALS) process.once(signal, onSignal);
  return () => {
    process.off('exit', onExit);
    for (const signal of STOP_SIGNALS) process.off(signal, onSignal);
  };
}

/** `data` as an {@link InstanceInfo}, or `null` when a field is missing or the wrong type. */
function asInstanceInfo(data: unknown): InstanceInfo | null {
  if (typeof data !== 'object' || data === null) return null;
  const { pid, port, root, version } = data as Record<string, unknown>;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  if (typeof root !== 'string' || root === '') return null;
  return { pid, port, root, version: typeof version === 'string' ? version : 'unknown' };
}
