/**
 * Run derivation: one phase's run-log events in, waves, per-sprint run state
 * and escalations out. Pure (data in, data out) and never throws on any event
 * list the reader can produce.
 *
 * Everything comes from **line order**; `ts` is only copied, never compared
 * (clocks skew, and parallel appends share a second).
 *
 * Runs and waves (spec: `run-log.md`, "Reading the log"):
 *
 * - Events are cut into waves wherever `wave` changes between consecutive
 *   lines. A drop in `wave` (e.g. 3 → 1) starts a new run, because
 *   phase-builder restarts wave numbers on every run of the phase; a rise
 *   (1 → 2) is the next wave of the same run. A run resumed inside the same
 *   wave number reads as a continuation of that wave.
 * - Within a wave, events are grouped by sprint in first-seen order.
 * - Wave start is the wave's first event. Wave end is reached once every
 *   sprint in the wave has a passing `doc_sync` as its latest event.
 * - `implement` `start` markers don't cut waves. The next wave's
 *   implementation starts while the previous wave's doc sync runs, so its
 *   start lines can land between that wave's lines. Each marker joins the wave
 *   with its wave number in the run it belongs to (the run of the wave before
 *   it in the log, or the next run when its wave number is lower), preferring
 *   one with lines after it; with none logged yet it opens that wave on its
 *   own. Markers are never gate steps and never attempts.
 *
 * Sprint state: see {@link SprintRunState} for the table. A wave "runs a wave
 * test" when any of its sprints is in {@link DeriveRunOptions.uiSprints}, or
 * when a `wave_test` line already appeared in the wave.
 *
 * Escalations: a sprint's latest event in a wave is a `verify` or `wave_test`
 * `fail` with `max > 0` and `attempt >= max`, and the sprint has no later
 * event anywhere in the log. `max: 0` never escalates. The escalation carries
 * every run of that gate for the sprint in the wave as its retry history.
 */
import type {
  Escalation,
  GateStep,
  PhaseRuns,
  RunEvent,
  RunGate,
  SprintRun,
  SprintRunState,
  WaveRun,
} from '../model.js';

/** Extra knowledge {@link deriveRun} can use that the log itself lacks. */
export interface DeriveRunOptions {
  /**
   * Ids of sprints that have a browser test (a `ui:` route and no
   * `skip-ui: true`). A wave holding any of them runs a wave test, so a sprint
   * whose `verify` passed is `testing` rather than `syncing`. `loadProject`
   * fills this from the phase file; without it, only a `wave_test` line
   * already seen in the wave marks it as a UI wave.
   */
  uiSprints?: Iterable<string>;
}

/** What {@link deriveRun} returns: the derived parts of {@link PhaseRuns}. */
export type RunDerivation = Pick<PhaseRuns, 'waves' | 'escalations' | 'sprintHistory'>;

/** Gates whose failure at the retry limit escalates. */
const ESCALATING_GATES: ReadonlySet<RunGate> = new Set<RunGate>(['verify', 'wave_test']);

/**
 * Derive waves, sprint runs and escalations from one phase's events.
 *
 * @param events The phase's events in log (line) order, as `readRunLog` returns them.
 * @param options See {@link DeriveRunOptions}.
 */
export function deriveRun(events: readonly RunEvent[], options: DeriveRunOptions = {}): RunDerivation {
  const uiSprints = new Set<string>(options.uiSprints ?? []);
  const waves: WaveRun[] = [];

  // 1. Cut the log into waves by line order. Start markers wait for step 1b.
  let run = 0;
  let current: RunEvent[] | null = null;
  let currentWave = -1;
  const groups: WaveGroup[] = [];
  const starts: RunEvent[] = [];
  for (const event of events) {
    if (isStartMarker(event)) {
      starts.push(event);
      continue;
    }
    if (current === null || event.wave !== currentWave) {
      if (current === null || event.wave < currentWave) run++;
      currentWave = event.wave;
      current = [];
      groups.push({ run, wave: event.wave, events: current });
    }
    current.push(event);
  }

  // 1b. Place each start marker in its wave (see the module comment).
  for (const start of starts) placeStartMarker(start, groups);
  for (const group of groups) group.events.sort((a, b) => a.line - b.line);

  // 2. Build each wave and its sprint runs.
  for (const group of groups) {
    waves.push(buildWave(group.run, group.wave, group.events, uiSprints));
  }

  // 3. A later event for a sprint (in any later wave or run) clears an
  //    earlier escalation of it: only a sprint's last SprintRun can escalate.
  const sprintHistory: Record<string, SprintRun[]> = {};
  for (const wave of waves) {
    for (const sr of wave.sprints) {
      (sprintHistory[sr.sprint] ??= []).push(sr);
    }
  }
  for (const runs of Object.values(sprintHistory)) {
    for (let i = 0; i < runs.length - 1; i++) runs[i]!.escalation = null;
  }

  const escalations: Escalation[] = [];
  for (const wave of waves) {
    wave.escalated = wave.sprints.some((s) => s.escalation !== null);
    for (const sr of wave.sprints) if (sr.escalation) escalations.push(sr.escalation);
  }
  escalations.sort((a, b) => a.line - b.line);

  return { waves, escalations, sprintHistory };
}

/** One wave's events while the log is being cut, before it becomes a {@link WaveRun}. */
interface WaveGroup {
  run: number;
  wave: number;
  events: RunEvent[];
}

/** An `implement` `start` line: a marker, never a gate step or an attempt. */
export function isStartMarker(event: Pick<RunEvent, 'gate' | 'result'>): boolean {
  return event.gate === 'implement' && event.result === 'start';
}

/**
 * Put one start marker into the wave it belongs to, or open that wave when
 * nothing else of it is logged yet. `groups` stays ordered by first line.
 */
function placeStartMarker(start: RunEvent, groups: WaveGroup[]): void {
  // Markers are appended unsorted until every one is placed, so scan for the ends.
  const firstLine = (g: WaveGroup): number => Math.min(...g.events.map((e) => e.line));
  const lastLine = (g: WaveGroup): number => Math.max(...g.events.map((e) => e.line));

  let before: WaveGroup | null = null;
  for (const g of groups) if (firstLine(g) < start.line) before = g;
  const run = before === null ? 1 : start.wave < before.wave ? before.run + 1 : before.run;

  const same = groups.filter((g) => g.wave === start.wave && g.run === run);
  const target = same.find((g) => lastLine(g) > start.line) ?? same[same.length - 1];
  if (target) {
    target.events.push(start);
    return;
  }
  const group: WaveGroup = { run, wave: start.wave, events: [start] };
  const at = groups.findIndex((g) => firstLine(g) > start.line);
  if (at === -1) groups.push(group);
  else groups.splice(at, 0, group);
}

/** Build one {@link WaveRun} from its events (all sharing one run and wave number). */
function buildWave(run: number, wave: number, events: RunEvent[], uiSprints: ReadonlySet<string>): WaveRun {
  const bySprint = new Map<string, RunEvent[]>();
  for (const e of events) {
    let list = bySprint.get(e.sprint);
    if (!list) bySprint.set(e.sprint, (list = []));
    list.push(e);
  }

  const first = events[0]!;
  const last = events[events.length - 1]!;
  const hasWaveTest =
    events.some((e) => e.gate === 'wave_test') || [...bySprint.keys()].some((id) => uiSprints.has(id));

  const sprints: SprintRun[] = [];
  for (const [sprint, list] of bySprint) {
    sprints.push(buildSprintRun(sprint, run, wave, list, hasWaveTest));
  }

  const files = unionFiles(events);
  const allDone = sprints.length > 0 && sprints.every((s) => s.state === 'done');

  return {
    phase: first.phase,
    run,
    wave,
    sprints,
    events,
    files,
    startedAt: first.ts,
    endedAt: allDone ? last.ts : null,
    escalated: sprints.some((s) => s.escalation !== null),
  };
}

/** Build one sprint's run within a wave. */
function buildSprintRun(
  sprint: string,
  run: number,
  wave: number,
  events: RunEvent[],
  waveHasWaveTest: boolean,
): SprintRun {
  const first = events[0]!;
  const last = events[events.length - 1]!;

  const gateEvents = events.filter((e) => !isStartMarker(e));
  const steps = toSteps(gateEvents);
  const attempts: Partial<Record<RunGate, number>> = {};
  for (const e of gateEvents) {
    const prev = attempts[e.gate];
    if (prev === undefined || e.attempt > prev) attempts[e.gate] = e.attempt;
  }

  const sr: SprintRun = {
    sprint,
    phase: first.phase,
    run,
    wave,
    events,
    steps,
    state: sprintState(events, waveHasWaveTest),
    attempts,
    lastEvent: last,
    escalation: null,
    files: unionFiles(events),
    startedAt: first.ts,
    updatedAt: last.ts,
  };
  sr.escalation = escalationFor(sr, events);
  return sr;
}

/**
 * The state after a sprint's events in one wave. See {@link SprintRunState}
 * for the table this implements.
 *
 * @param events The sprint's events in this wave, in line order.
 * @param waveHasWaveTest Whether the wave runs a wave test.
 */
export function sprintState(events: readonly RunEvent[], waveHasWaveTest: boolean): SprintRunState {
  let latest: RunEvent | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.gate !== 'unknown') {
      latest = events[i];
      break;
    }
  }
  if (!latest) return 'implementing';
  const failed = latest.result === 'fail';
  switch (latest.gate) {
    case 'implement':
      return latest.result === 'start' ? 'implementing' : 'verifying';
    case 'verify':
      if (failed) return 'failed';
      return waveHasWaveTest ? 'testing' : 'syncing';
    case 'wave_test':
      return failed ? 'failed' : 'syncing';
    case 'doc_sync':
      return failed ? 'failed' : 'done';
    default:
      return 'implementing';
  }
}

/**
 * The escalation ending this sprint's wave, if its latest event is an
 * escalating gate's `fail` at the limit. Whether a later wave clears it is
 * decided by the caller.
 */
function escalationFor(sr: SprintRun, events: readonly RunEvent[]): Escalation | null {
  const last = events[events.length - 1];
  if (!last) return null;
  if (!ESCALATING_GATES.has(last.gate) || last.result !== 'fail') return null;
  if (last.max <= 0 || last.attempt < last.max) return null;
  return {
    phase: last.phase,
    run: sr.run,
    wave: sr.wave,
    sprint: sr.sprint,
    gate: last.gate,
    attempt: last.attempt,
    max: last.max,
    summary: last.summary,
    ts: last.ts,
    line: last.line,
    history: events
      .filter((e) => e.gate === last.gate)
      .map((e) => ({ attempt: e.attempt, result: e.result, summary: e.summary, ts: e.ts, line: e.line })),
  };
}

/** Events as {@link GateStep}s, numbering each gate's occurrences in line order. */
export function toSteps(events: readonly RunEvent[]): GateStep[] {
  const seen: Partial<Record<RunGate, number>> = {};
  return events.map((e) => {
    const seq = (seen[e.gate] ?? 0) + 1;
    seen[e.gate] = seq;
    const step: GateStep = {
      gate: e.gate,
      result: e.result,
      attempt: e.attempt,
      max: e.max,
      seq,
      summary: e.summary,
      ts: e.ts,
      line: e.line,
    };
    if (e.files) step.files = [...e.files];
    return step;
  });
}

/** Union of `files` over `doc_sync` events, first-seen order; `null` when none carried `files`. */
function unionFiles(events: readonly RunEvent[]): string[] | null {
  let out: string[] | null = null;
  const seen = new Set<string>();
  for (const e of events) {
    if (e.gate !== 'doc_sync' || !e.files) continue;
    out ??= [];
    for (const f of e.files) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
