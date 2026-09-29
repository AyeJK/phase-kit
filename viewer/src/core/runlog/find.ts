/**
 * Locates run-log files: `{phasesDir}/.runs/phase-{N}.jsonl`.
 *
 * Only regular files named exactly `phase-{N}.jsonl` (N a whole number written
 * without leading zeros, lowercase name as the writer produces it) count;
 * anything else in `.runs/` is ignored. Never throws: a missing or unreadable
 * `.runs/` folder yields `[]`, and a file that vanishes between listing and
 * stat is left out.
 */
import { readdirSync, statSync, type Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Name of the run-log folder inside the phases folder. */
export const RUNS_DIR_NAME = '.runs';

/** One run-log file found by {@link findRunLogs}. */
export interface RunLogFile {
  /** Phase number `N` from the file name. */
  phase: number;
  /** Path of the file: `{phasesDir}/.runs/phase-{N}.jsonl` (absolute when `phasesDir` is). */
  file: string;
  /** Last-modified time in milliseconds since the epoch (drives the default-tab rule). */
  mtimeMs: number;
}

const RUN_LOG_NAME = /^phase-(0|[1-9]\d*)\.jsonl$/;

/**
 * The phase number a run-log file name maps to, or `null` when the name isn't
 * `phase-{N}.jsonl`.
 */
export function runLogPhase(name: string): number | null {
  const m = RUN_LOG_NAME.exec(name);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** List every run log under `{phasesDir}/.runs/`, sorted by phase number. */
export async function findRunLogs(phasesDir: string): Promise<RunLogFile[]> {
  const runsDir = path.join(phasesDir, RUNS_DIR_NAME);
  let names: string[];
  try {
    names = await readdir(runsDir);
  } catch {
    return [];
  }
  const found: RunLogFile[] = [];
  for (const name of names) {
    const phase = runLogPhase(name);
    if (phase === null) continue;
    const file = path.join(runsDir, name);
    let st: Stats;
    try {
      st = await stat(file);
    } catch {
      continue;
    }
    if (st.isFile()) found.push({ phase, file, mtimeMs: st.mtimeMs });
  }
  return found.sort((a, b) => a.phase - b.phase);
}

/** Synchronous {@link findRunLogs}, same rules and output. */
export function findRunLogsSync(phasesDir: string): RunLogFile[] {
  const runsDir = path.join(phasesDir, RUNS_DIR_NAME);
  let names: string[];
  try {
    names = readdirSync(runsDir);
  } catch {
    return [];
  }
  const found: RunLogFile[] = [];
  for (const name of names) {
    const phase = runLogPhase(name);
    if (phase === null) continue;
    const file = path.join(runsDir, name);
    let st: Stats;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    if (st.isFile()) found.push({ phase, file, mtimeMs: st.mtimeMs });
  }
  return found.sort((a, b) => a.phase - b.phase);
}
