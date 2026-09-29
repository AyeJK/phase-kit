#!/usr/bin/env node
/**
 * Play a phase-builder run against a throwaway copy of a fixture project, so
 * the viewer has something live to show without running phase-builder.
 *
 *     tsx scripts/simulate-run.ts [--fixture trail-log] [--script retry|escalation|none]
 *                                 [--interval 2000] [--stale | --as-is] [--out <folder>] [--keep]
 *
 * 1. {@link prepareFixture} copies `test/fixtures/{fixture}/` into a temp
 *    folder (`{tmp}/phase-viewer-sim-XXXX/{fixture}/`, so the project folder
 *    keeps the fixture's name) and, unless `freshness` is `as-is`, shifts
 *    every `ts` in its run logs so the latest event is recent (`fresh`, 90 s
 *    ago) or old (`stale`, 3 h ago). Relative gaps between events are kept.
 * 2. {@link simulateRun} appends a scripted sequence of run-log v1 events
 *    (see `plugin/skills/phase-builder/run-log.md`) at a fixed interval, each
 *    stamped with the current time, the way the gate agents would. When a
 *    step is a doc-sync, it first marks that sprint's tasks done in the phase
 *    file, as phase-doc-sync does.
 *
 * Scripts (written for the `trail-log` fixture, phase 2):
 *
 * | Script       | What it appends |
 * |--------------|-----------------|
 * | `retry`      | Wave 2: sprints 2.2 (UI) and 2.3 in parallel; 2.3's verify fails at attempt 1 and passes at attempt 2; wave test; doc sync. Wave 3: sprint 2.4 passes first time. |
 * | `escalation` | Wave 2 as in `retry`, then wave 3: sprint 2.4's verify fails at attempts 1, 2 and 3 of 3, and nothing after (an escalation). |
 * | `none`       | Nothing. The copy is left as prepared (useful with `stale`). |
 *
 * Used by `npm run dev` (`scripts/dev.ts`), by Playwright through it, and by
 * tests, which import the functions directly. Running this file on its own
 * prints the project folder to point a viewer at
 * (`npm run serve -- --dir <folder>`), plays the script, and removes the copy
 * on Ctrl+C unless `--keep` is given.
 */
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** `test/fixtures/`, where fixture projects live. */
export const FIXTURES_ROOT = fileURLToPath(new URL('../test/fixtures/', import.meta.url));

/** The fixture the scripts are written for, and the default. */
export const DEFAULT_FIXTURE = 'trail-log';

/** Default time between scripted steps. */
export const DEFAULT_INTERVAL_MS = 2_000;

/** How the copied run logs' existing timestamps are treated. */
export type Freshness = 'fresh' | 'stale' | 'as-is';

/** How long before now the latest existing event lands, per {@link Freshness}. */
export const FRESHNESS_AGE_MS: Record<Exclude<Freshness, 'as-is'>, number> = {
  fresh: 90_000,
  stale: 3 * 60 * 60_000,
};

/** A named scripted sequence. See the module comment. */
export type ScriptName = 'retry' | 'escalation' | 'none';

/** Every script name. */
export const SCRIPT_NAMES: readonly ScriptName[] = ['retry', 'escalation', 'none'];

/** One run-log event to append, without `v` and `ts` (added when it's written). */
export interface ScriptEvent {
  phase: number;
  wave: number;
  sprint: string;
  gate: 'implement' | 'verify' | 'wave_test' | 'doc_sync';
  result: 'pass' | 'partial' | 'warn' | 'fail' | 'blocked';
  attempt: number;
  max: number;
  summary: string;
  /** `doc_sync` only. */
  files?: string[];
}

/** What happens at one tick: events appended together, like one gate's chained append lines. */
export interface ScriptStep {
  events: ScriptEvent[];
  /** Sprint ids whose `—` / `~` tasks are marked `x` in the phase file before the events are appended. */
  markDone?: string[];
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const ev = (
  wave: number,
  sprint: string,
  gate: ScriptEvent['gate'],
  result: ScriptEvent['result'],
  attempt: number,
  summary: string,
  files?: string[],
): ScriptEvent => ({
  phase: 2,
  wave,
  sprint,
  gate,
  result,
  attempt,
  max: gate === 'doc_sync' ? 1 : 3,
  summary,
  ...(files ? { files } : {}),
});

const WAVE_2_FILES = [
  'src/db/photos.ts',
  'src/photos/import.ts',
  'src/photos/import.test.ts',
  'src/trips/TripDetail.tsx',
  'src/trips/WaypointNote.tsx',
  'src/trips/WaypointNote.css',
];

/** Phase 2, wave 2: 2.2 and 2.3 in parallel, 2.3 fails verify once and passes on retry. */
const WAVE_2: ScriptStep[] = [
  {
    events: [
      ev(2, '2.2', 'implement', 'pass', 1, 'done 1,2,3 — Note editor saves on blur; 2,000-character limit'),
      ev(2, '2.3', 'implement', 'pass', 1, 'done 1,2,3 — Photos table and resize on import'),
    ],
  },
  {
    events: [
      ev(2, '2.2', 'verify', 'pass', 1, 'criteria 2/2 met'),
      ev(2, '2.3', 'verify', 'fail', 1, 'test: 2 failing in src/photos/import.test.ts (portrait photos come out 1600px wide)'),
    ],
  },
  { events: [ev(2, '2.3', 'implement', 'pass', 2, 'done 1,2,3 — Retry 1. Resize on the long edge, keep the aspect ratio.')] },
  {
    events: [
      ev(2, '2.2', 'verify', 'pass', 2, 'criteria 2/2 met'),
      ev(2, '2.3', 'verify', 'pass', 2, 'criteria 2/2 met'),
    ],
  },
  {
    events: [
      ev(2, '2.2', 'wave_test', 'pass', 1, '1 URLs, 3 viewports'),
      ev(2, '2.3', 'wave_test', 'pass', 1, '1 URLs, 3 viewports'),
    ],
  },
  {
    markDone: ['2.2', '2.3'],
    events: [
      ev(2, '2.2', 'doc_sync', 'pass', 1, '3 tasks updated', WAVE_2_FILES),
      ev(2, '2.3', 'doc_sync', 'pass', 1, '3 tasks updated', WAVE_2_FILES),
    ],
  },
];

/** Phase 2, wave 3: 2.4 passes first time. */
const WAVE_3_PASS: ScriptStep[] = [
  { events: [ev(3, '2.4', 'implement', 'pass', 1, 'done 1,2,3 — .trail archive export and import')] },
  { events: [ev(3, '2.4', 'verify', 'pass', 1, 'criteria 1/1 met')] },
  {
    markDone: ['2.4'],
    events: [ev(3, '2.4', 'doc_sync', 'pass', 1, '3 tasks updated', ['src/export/archive.ts', 'src/export/archive.test.ts'])],
  },
];

/** Phase 2, wave 3: 2.4 fails verify at attempts 1, 2 and 3 of 3, then nothing (an escalation). */
const WAVE_3_ESCALATE: ScriptStep[] = [
  { events: [ev(3, '2.4', 'implement', 'pass', 1, 'done 1,2,3 — .trail archive export and import')] },
  { events: [ev(3, '2.4', 'verify', 'fail', 1, 'test: round trip loses photo order in src/export/archive.test.ts')] },
  { events: [ev(3, '2.4', 'implement', 'pass', 2, 'done 1,2,3 — Retry 1. Sort photos by waypoint index on import.')] },
  { events: [ev(3, '2.4', 'verify', 'fail', 2, 'test: round trip loses photo order in src/export/archive.test.ts')] },
  { events: [ev(3, '2.4', 'implement', 'pass', 3, 'done 1,2,3 — Retry 2. Store the photo order in the archive manifest.')] },
  { events: [ev(3, '2.4', 'verify', 'fail', 3, 'test: 1 failing in src/export/archive.test.ts (photo order on a trip with 40+ photos)')] },
];

/** The steps of a named script. Returns a fresh copy each call. */
export function buildScript(name: ScriptName): ScriptStep[] {
  const steps =
    name === 'retry' ? [...WAVE_2, ...WAVE_3_PASS] : name === 'escalation' ? [...WAVE_2, ...WAVE_3_ESCALATE] : [];
  return steps.map((step) => ({
    events: step.events.map((e) => ({ ...e, ...(e.files ? { files: [...e.files] } : {}) })),
    ...(step.markDone ? { markDone: [...step.markDone] } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Fixture copy
// ---------------------------------------------------------------------------

/** Options for {@link prepareFixture}. */
export interface PrepareOptions {
  /** Folder name under `test/fixtures/`. Default {@link DEFAULT_FIXTURE}. */
  fixture?: string;
  /**
   * Folder to copy into; the project lands at `{dir}/{fixture}` and must not
   * exist yet. Default: a new `phase-viewer-sim-*` folder in the OS temp folder.
   */
  dir?: string;
  /** Default `fresh`. */
  freshness?: Freshness;
  /** "Now" for `freshness` (for tests). Default `new Date()`. */
  preparedAt?: Date;
}

/** A prepared copy. */
export interface PreparedFixture {
  /** Absolute project folder (what `phase-viewer --dir` takes). */
  root: string;
  /** Absolute `{root}/docs/phases`. */
  phasesDir: string;
  /** Absolute `{root}/docs/phases/.runs`. */
  runsDir: string;
  /** The project folder's name (the fixture name), which the viewer shows as the project name. */
  name: string;
  /** Delete the copy (and the temp folder when this call created it). Safe to call twice. */
  cleanup(): Promise<void>;
}

/** Copy a fixture project to a throwaway folder and set its run-log freshness. */
export async function prepareFixture(options: PrepareOptions = {}): Promise<PreparedFixture> {
  const name = options.fixture ?? DEFAULT_FIXTURE;
  const source = path.join(FIXTURES_ROOT, name);
  if (!(await isDirectory(path.join(source, 'docs', 'phases')))) {
    throw new Error(`No fixture project at ${source} (expected docs/phases/ inside it)`);
  }

  let owned: string;
  let root: string;
  if (options.dir === undefined) {
    owned = await mkdtemp(path.join(tmpdir(), 'phase-viewer-sim-'));
    root = path.join(owned, name);
  } else {
    await mkdir(options.dir, { recursive: true });
    root = path.resolve(options.dir, name);
    if (await exists(root)) throw new Error(`${root} already exists; remove it or pick another --out folder`);
    owned = root;
  }
  await cp(source, root, { recursive: true });

  const phasesDir = path.join(root, 'docs', 'phases');
  const runsDir = path.join(phasesDir, '.runs');
  const freshness = options.freshness ?? 'fresh';
  if (freshness !== 'as-is') {
    await retimeRunLogs(runsDir, (options.preparedAt ?? new Date()).getTime() - FRESHNESS_AGE_MS[freshness]);
  }

  let cleaned: Promise<void> | null = null;
  return {
    root,
    phasesDir,
    runsDir,
    name,
    cleanup() {
      cleaned ??= rm(owned, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      return cleaned;
    },
  };
}

/**
 * Shift every event's `ts` in every `.jsonl` in `runsDir` by one offset, so
 * the latest event across all logs lands at `latestAt` (ms since the epoch).
 * Lines that aren't JSON events with a valid `ts` are kept unchanged.
 */
async function retimeRunLogs(runsDir: string, latestAt: number): Promise<void> {
  let names: string[];
  try {
    names = (await readdir(runsDir)).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return;
  }
  const logs = await Promise.all(
    names.map(async (n) => ({ file: path.join(runsDir, n), text: await readFile(path.join(runsDir, n), 'utf8') })),
  );

  let latest = -Infinity;
  for (const { text } of logs) {
    for (const line of text.split('\n')) {
      const t = eventTime(line);
      if (t !== null && t > latest) latest = t;
    }
  }
  if (!Number.isFinite(latest)) return;
  const offset = latestAt - latest;

  for (const { file, text } of logs) {
    const out = text
      .split('\n')
      .map((line) => {
        const t = eventTime(line);
        if (t === null) return line;
        const event = JSON.parse(line) as Record<string, unknown>;
        event.ts = formatTs(new Date(t + offset));
        return JSON.stringify(event);
      })
      .join('\n');
    await writeFile(file, out, 'utf8');
  }
}

/** The `ts` of a run-log line in ms, or `null` when the line isn't an event with a valid `ts`. */
function eventTime(line: string): number | null {
  if (line.trim() === '') return null;
  try {
    const event: unknown = JSON.parse(line);
    const ts = typeof event === 'object' && event !== null ? (event as { ts?: unknown }).ts : undefined;
    if (typeof ts !== 'string') return null;
    const t = Date.parse(ts);
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

/** `YYYY-MM-DDTHH:MM:SSZ`, the run log's `ts` format (UTC, no milliseconds). */
export function formatTs(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Playing a script
// ---------------------------------------------------------------------------

/** Options for {@link simulateRun}. */
export interface SimulateOptions {
  /** The project folder to write into (normally {@link PreparedFixture.root}). */
  root: string;
  /** Named script. Default `retry`. Ignored when `steps` is given. */
  script?: ScriptName;
  /** Explicit steps instead of a named script. */
  steps?: ScriptStep[];
  /** Time between steps. Default {@link DEFAULT_INTERVAL_MS}. */
  intervalMs?: number;
  /** Time before the first step. Default `intervalMs`. */
  startDelayMs?: number;
  /** Called after each step is written, with its 0-based index. */
  onStep?: (step: ScriptStep, index: number) => void;
  /** The clock used for `ts`. Default `() => new Date()`. */
  now?: () => Date;
}

/** A running simulation. */
export interface Simulation {
  /** Resolves when every step is written or {@link Simulation.stop} is called; rejects if a write fails. */
  readonly done: Promise<void>;
  /** Stop before the next step. Safe to call twice. */
  stop(): void;
}

/** Append a script's steps to the project's run logs, one step per interval. */
export function simulateRun(options: SimulateOptions): Simulation {
  const steps = options.steps ?? buildScript(options.script ?? 'retry');
  const interval = Math.max(0, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  const startDelay = Math.max(0, options.startDelayMs ?? interval);
  const now = options.now ?? (() => new Date());

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let finish: () => void = () => {};

  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    let index = 0;
    const tick = async (): Promise<void> => {
      if (stopped || index >= steps.length) return resolve();
      const step = steps[index]!;
      try {
        await writeStep(options.root, step, now());
      } catch (err) {
        return reject(err instanceof Error ? err : new Error(String(err)));
      }
      options.onStep?.(step, index);
      index++;
      if (stopped || index >= steps.length) return resolve();
      timer = setTimeout(() => void tick(), interval);
    };
    if (steps.length === 0) resolve();
    else timer = setTimeout(() => void tick(), startDelay);
  });

  return {
    done,
    stop() {
      stopped = true;
      clearTimeout(timer);
      finish();
    },
  };
}

/** Write one step: phase-file status edits first (as doc-sync does), then the events. */
export async function writeStep(root: string, step: ScriptStep, at: Date): Promise<void> {
  const phasesDir = path.join(root, 'docs', 'phases');
  for (const sprint of step.markDone ?? []) await markSprintDone(phasesDir, sprint);

  const ts = formatTs(at);
  const byFile = new Map<string, string[]>();
  for (const e of step.events) {
    const file = path.join(phasesDir, '.runs', `phase-${e.phase}.jsonl`);
    const lines = byFile.get(file) ?? [];
    lines.push(eventLine(e, ts));
    byFile.set(file, lines);
  }
  for (const [file, lines] of byFile) {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, lines.map((l) => `${l}\n`).join(''), 'utf8');
  }
}

/** One run-log v1 line, with keys in the order the gate agents write them. */
export function eventLine(e: ScriptEvent, ts: string): string {
  return JSON.stringify({
    v: 1,
    ts,
    phase: e.phase,
    wave: e.wave,
    sprint: e.sprint,
    gate: e.gate,
    result: e.result,
    attempt: e.attempt,
    max: e.max,
    summary: e.summary,
    ...(e.files ? { files: e.files } : {}),
  });
}

/**
 * Mark every to-do or active task in sprint `id` done, in whichever phase
 * file holds its `# Sprint {id}` header: the Status cell `—`, `-`, `–` or `~`
 * becomes `x`. Does nothing when no phase file has the sprint.
 */
export async function markSprintDone(phasesDir: string, id: string): Promise<void> {
  const header = new RegExp(`^#\\s+Sprint\\s+${id.replace('.', '\\.')}(?![\\d.])`);
  for (const name of await readdir(phasesDir)) {
    if (!/^Phase-\d+.*\.md$/i.test(name)) continue;
    const file = path.join(phasesDir, name);
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    const start = lines.findIndex((l) => header.test(l));
    if (start === -1) continue;
    let changed = false;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^#\s+Sprint\b/.test(line) || /^##\s/.test(line)) break;
      const next = line.replace(/^\|\s*(?:—|–|-|~)\s*\|/, '| x |');
      if (next !== line) {
        lines[i] = next;
        changed = true;
      }
    }
    if (changed) await writeFile(file, lines.join('\n'), 'utf8');
    return;
  }
}

// ---------------------------------------------------------------------------
// Both together
// ---------------------------------------------------------------------------

/** A prepared copy with a script playing on it. */
export interface SimulatedProject {
  fixture: PreparedFixture;
  simulation: Simulation;
  /** Stop the script and delete the copy. */
  close(): Promise<void>;
}

/** {@link prepareFixture}, then {@link simulateRun} on the copy. */
export async function startSimulatedProject(
  options: PrepareOptions & Omit<SimulateOptions, 'root'> = {},
): Promise<SimulatedProject> {
  const fixture = await prepareFixture(options);
  const simulation = simulateRun({ ...options, root: fixture.root });
  return {
    fixture,
    simulation,
    async close() {
      simulation.stop();
      await simulation.done.catch(() => undefined);
      await fixture.cleanup();
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Parse `--interval`-style values: a whole number of ms, or `null`. */
export function parseMs(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Whether `raw` names a script. */
export function isScriptName(raw: string): raw is ScriptName {
  return (SCRIPT_NAMES as readonly string[]).includes(raw);
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

/** Whether this module is the program Node started (not an import). */
function isProcessEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    const started = realpathSync(entry);
    return process.platform === 'win32' ? self.toLowerCase() === started.toLowerCase() : self === started;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      script: { type: 'string' },
      escalate: { type: 'boolean' },
      interval: { type: 'string' },
      stale: { type: 'boolean' },
      'as-is': { type: 'boolean' },
      out: { type: 'string' },
      keep: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });

  const script = values.escalate ? 'escalation' : (values.script ?? 'retry');
  if (!isScriptName(script)) throw new Error(`--script must be one of ${SCRIPT_NAMES.join(', ')}`);
  const intervalMs = values.interval === undefined ? DEFAULT_INTERVAL_MS : parseMs(values.interval);
  if (intervalMs === null) throw new Error('--interval must be a whole number of milliseconds');
  const freshness: Freshness = values['as-is'] ? 'as-is' : values.stale ? 'stale' : 'fresh';

  const sim = await startSimulatedProject({
    fixture: values.fixture,
    dir: values.out,
    freshness,
    script,
    intervalMs,
    onStep: (step, index) => {
      const what = step.events.map((e) => `${e.sprint} ${e.gate} ${e.result}`).join(', ');
      process.stdout.write(`step ${index + 1}: ${what}\n`);
    },
  });
  process.stdout.write(
    [
      `simulate-run: ${script} script on a copy of ${sim.fixture.name}`,
      `project: ${sim.fixture.root}`,
      `view it: npm run serve -- --dir "${sim.fixture.root}"`,
      values.keep ? 'Ctrl+C stops; the copy is kept.' : 'Ctrl+C stops and deletes the copy.',
      '',
    ].join('\n'),
  );

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    sim.simulation.stop();
    void (values.keep ? Promise.resolve() : sim.fixture.cleanup()).finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await sim.simulation.done;
  process.stdout.write('Script finished. Ctrl+C to exit.\n');
  // Stay alive so the copy survives until Ctrl+C.
  setInterval(() => {}, 1 << 30);
}

if (isProcessEntry()) {
  main().catch((err: unknown) => {
    process.stderr.write(`simulate-run: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
