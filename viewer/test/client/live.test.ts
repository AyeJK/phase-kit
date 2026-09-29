/**
 * The wave timeline derivation (`src/client/live/derive.ts`) against the
 * `trail-log` fixture, with the `retry` and `escalation` scripts played step
 * by step: waves (logged and waiting), the fixed pipeline, attempt notes,
 * escalations and the wave count the phase badge reads.
 */
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  attemptTitle,
  dependsOnNote,
  escalationTitle,
  liveView,
  resolutionText,
  type LiveView,
  type SprintCardView,
  type StageView,
} from '../../src/client/live/derive.js';
import { formatTime } from '../../src/client/format.js';
import { loadProject } from '../../src/core/load.js';
import type { Project, Sprint } from '../../src/core/model.js';
import {
  buildScript,
  FIXTURES_ROOT,
  prepareFixture,
  writeStep,
  type PreparedFixture,
  type ScriptStep,
} from '../../scripts/simulate-run.js';

const TRAIL_LOG = path.join(FIXTURES_ROOT, 'trail-log');
const AT = new Date('2026-09-28T15:00:00Z');

const fixtures: PreparedFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fx) => fx.cleanup()));
});

/** A copy of trail-log with the given steps written. */
async function withSteps(steps: ScriptStep[]): Promise<Project> {
  const fx = await prepareFixture({ freshness: 'as-is' });
  fixtures.push(fx);
  for (const step of steps) await writeStep(fx.root, step, AT);
  return loadProject(fx.root);
}

/** The first `n` steps of a script. */
function first(script: 'retry' | 'escalation', n?: number): ScriptStep[] {
  const steps = buildScript(script);
  return n === undefined ? steps : steps.slice(0, n);
}

function view(project: Project, phase: number): LiveView {
  return liveView(project, project.phases.find((p) => p.number === phase)!);
}

function card(v: LiveView, id: string): SprintCardView {
  for (const w of v.waves) {
    const c = w.cards.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`no card for ${id}`);
}

/** `gate:state×count` per chip, e.g. `verify:passed×2`. */
function chips(c: SprintCardView): string[] {
  return c.stages.map((s: StageView) => `${s.gate}:${s.state}×${s.count}`);
}

function waves(v: LiveView): Array<[number, string, string[]]> {
  return v.waves.map((w): [number, string, string[]] => [w.wave, w.state, w.cards.map((c) => c.id)]);
}

describe('no run log', () => {
  it('has no waves and no wave count', async () => {
    const v = view(await loadProject(TRAIL_LOG), 3);
    expect(v.hasRunLog).toBe(false);
    expect(v.waves).toEqual([]);
    expect(v.current).toBeNull();
    expect(v.escalations).toEqual([]);
    expect(v.runningKey).toBeNull();
  });
});

describe('a finished phase', () => {
  it('shows each logged wave done, with its retry and resolution', async () => {
    const v = view(await loadProject(TRAIL_LOG), 1);
    expect(waves(v)).toEqual([
      [1, 'done', ['1.1']],
      [2, 'done', ['1.2']],
    ]);
    expect(v.current).toBe(2);
    expect(v.total).toBe(2);
    expect(v.retries).toBe(1);
    expect(v.runningKey).toBeNull();
    expect(v.lastEventAt).toBe(Date.parse('2026-09-27T14:33:19Z'));

    // 1.1 has no browser test: no Wave test chip.
    expect(chips(card(v, '1.1'))).toEqual(['implement:done×1', 'verify:passed×1', 'doc_sync:passed×1']);
    expect(chips(card(v, '1.2'))).toEqual([
      'implement:done×2',
      'verify:passed×2',
      'wave_test:passed×1',
      'doc_sync:passed×1',
    ]);

    const [note] = card(v, '1.2').notes;
    expect(note).toBeDefined();
    expect(attemptTitle(note!)).toBe('Verify attempt 1 failed');
    expect(note!.summary).toBe('typecheck: 1 error in src/trips/TripList.tsx');
    expect(note!.resolution).toEqual({ implementAttempt: 2, gate: 'verify', attempt: 2, ts: '2026-09-27T14:28:30Z' });
    expect(resolutionText(note!.resolution!)).toBe(
      `Fixed in implement attempt 2; verify passed at ${formatTime('2026-09-27T14:28:30Z')}.`,
    );

    expect(v.waves[0]!.dependsOn).toBeNull();
    expect(v.waves[1]!.dependsOn).toBe('depends on wave 1');
    expect(v.waves[1]!.parallel).toBe(false);
    expect(v.waves[0]!.startedAt).toBe('2026-09-27T14:02:11Z');
    expect(v.waves[0]!.endedAt).toBe('2026-09-27T14:05:02Z');
  });
});

describe('the retry script, step by step', () => {
  it('forecasts waiting waves from dependencies before the next wave starts', async () => {
    const v = view(await withSteps([]), 2);
    expect(waves(v)).toEqual([
      [1, 'done', ['2.1']],
      [2, 'waiting', ['2.2', '2.3']],
      [3, 'waiting', ['2.4']],
    ]);
    expect(v.waves.map((w) => w.parallel)).toEqual([false, true, false]);
    expect(v.waves.map((w) => w.dependsOn)).toEqual(['depends on Phase 1', 'depends on wave 1', 'depends on wave 2']);
    expect([v.current, v.total]).toEqual([1, 3]);
    expect(card(v, '2.2').waiting).toBe(true);
    expect(card(v, '2.2').stages).toEqual([]);
    expect(v.waves[1]!.startedAt).toBeNull();
    expect(v.waves[1]!.endedAt).toBeNull();
  });

  it('shows a failed verify as failed with an unresolved note, and the next gate as running', async () => {
    const v = view(await withSteps(first('retry', 2)), 2);
    expect(waves(v)).toEqual([
      [1, 'done', ['2.1']],
      [2, 'running', ['2.2', '2.3']],
      [3, 'waiting', ['2.4']],
    ]);
    expect(v.runningKey).toBe('2:1:2');
    expect(v.retries).toBe(1);
    expect(v.waves[1]!.startedAt).not.toBeNull();
    expect(Date.parse(v.waves[1]!.startedAt!)).toBe(AT.getTime());
    expect(v.waves[1]!.endedAt).toBeNull();

    // 2.2 has a browser test: its verify passed, so the wave test is next.
    expect(chips(card(v, '2.2'))).toEqual([
      'implement:done×1',
      'verify:passed×1',
      'wave_test:running×1',
      'doc_sync:not-started×0',
    ]);
    // 2.3 is skip-ui: no Wave test chip, and nothing runs after a failure.
    expect(chips(card(v, '2.3'))).toEqual(['implement:done×1', 'verify:failed×1', 'doc_sync:not-started×0']);
    const notes = card(v, '2.3').notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]!.resolution).toBeNull();
    expect(notes[0]!.summary).toMatch(/^test: 2 failing in src\/photos\/import\.test\.ts/);
  });

  it('shows the retry as the running verify with its attempt count', async () => {
    const v = view(await withSteps(first('retry', 3)), 2);
    expect(chips(card(v, '2.3'))).toEqual(['implement:done×2', 'verify:running×2', 'doc_sync:not-started×0']);
  });

  it('shows verify passed ×2 once the retry passes, with the note resolved, and never adds chips', async () => {
    const v = view(await withSteps(first('retry', 4)), 2);
    expect(chips(card(v, '2.3'))).toEqual(['implement:done×2', 'verify:passed×2', 'doc_sync:not-started×0']);
    const [note] = card(v, '2.3').notes;
    expect(note!.resolution).toMatchObject({ implementAttempt: 2, gate: 'verify', attempt: 2 });
    expect(resolutionText(note!.resolution!)).toBe(`Fixed in implement attempt 2; verify passed at ${formatTime(AT)}.`);

    // After the wave test, a skip-ui sprint still has three chips, and sync runs.
    const after = view(await withSteps(first('retry', 5)), 2);
    expect(chips(card(after, '2.3'))).toEqual(['implement:done×2', 'verify:passed×2', 'doc_sync:running×1']);
  });

  it('gives the wave its end once every sprint synced, and runs the next wave', async () => {
    const synced = view(await withSteps(first('retry', 6)), 2);
    expect(waves(synced)).toEqual([
      [1, 'done', ['2.1']],
      [2, 'done', ['2.2', '2.3']],
      [3, 'waiting', ['2.4']],
    ]);
    expect(synced.waves[1]!.endedAt).not.toBeNull();
    expect(synced.runningKey).toBeNull();

    const next = view(await withSteps(first('retry', 7)), 2);
    expect(waves(next)).toEqual([
      [1, 'done', ['2.1']],
      [2, 'done', ['2.2', '2.3']],
      [3, 'running', ['2.4']],
    ]);
    expect(next.runningKey).toBe('2:1:3');
    expect(next.waves[2]!.dependsOn).toBe('depends on wave 2');

    const all = view(await withSteps(first('retry')), 2);
    expect(waves(all).map(([, state]) => state)).toEqual(['done', 'done', 'done']);
    expect([all.current, all.total]).toEqual([3, 3]);
  });
});

describe('the escalation script', () => {
  it('derives the escalation, three failed notes, and no running chip', async () => {
    const v = view(await withSteps(first('escalation')), 2);
    expect(v.escalations).toHaveLength(1);
    expect(escalationTitle(v.escalations[0]!)).toBe('Verify retry limit reached (3/3) on sprint 2.4');
    const c = card(v, '2.4');
    expect(c.escalation).not.toBeNull();
    expect(chips(c)).toEqual(['implement:done×3', 'verify:failed×3', 'doc_sync:not-started×0']);
    expect(c.notes.map((n) => [n.attempt, n.resolution])).toEqual([
      [1, null],
      [2, null],
      [3, null],
    ]);
    // 2.3's one retry and 2.4's first two; the third failure is the escalation, not a retry.
    expect(v.retries).toBe(3);
    expect(v.waves[2]!.state).toBe('running');
  });

  it('clears the escalation when a later event for the sprint is logged', async () => {
    const later: ScriptStep = {
      events: [
        {
          phase: 2,
          wave: 3,
          sprint: '2.4',
          gate: 'implement',
          result: 'pass',
          attempt: 1,
          max: 3,
          summary: 'done 1,2,3 — Continue retrying. Keep photo order in the manifest.',
        },
      ],
    };
    const v = view(await withSteps([...first('escalation'), later]), 2);
    expect(v.escalations).toEqual([]);
    expect(card(v, '2.4').escalation).toBeNull();
    expect(chips(card(v, '2.4'))).toEqual(['implement:done×4', 'verify:running×4', 'doc_sync:not-started×0']);
  });
});

describe('dependsOnNote', () => {
  const sprint = (id: string, deps: Array<{ sprints?: string[]; phases?: number[]; none?: boolean }>): Sprint =>
    ({
      id,
      dependencies: deps.map((d, i) => ({
        raw: '',
        sprints: d.sprints ?? [],
        phases: d.phases ?? [],
        none: d.none ?? false,
        line: i + 1,
      })),
    }) as unknown as Sprint;

  it('names other phases, earlier waves and unplaced sprints, joined in prose', () => {
    const waveOf = new Map([
      ['2.1', 1],
      ['2.2', 2],
      ['2.3', 3],
    ]);
    const s = sprint('2.4', [{ phases: [1] }, { sprints: ['2.1', '2.2', '3.1'] }]);
    expect(dependsOnNote([s], 4, waveOf, 2)).toBe('depends on Phase 1, waves 1 and 2 and sprint 3.1');
  });

  it('is null when nothing is known', () => {
    expect(dependsOnNote([sprint('2.1', [{ none: true }])], 1, new Map(), 2)).toBeNull();
    expect(dependsOnNote([sprint('2.1', [])], 1, new Map(), 2)).toBeNull();
  });
});
