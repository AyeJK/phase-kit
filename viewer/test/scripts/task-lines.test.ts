/**
 * `scripts/simulate-run.ts` and the run log's `task` lines: a played run
 * writes them between each sprint's `implement` `start` and its result, the
 * reader accepts them, and they change nothing the gate lines say.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject } from '../../src/core/load.js';
import {
  addTaskLines,
  buildRun,
  buildScript,
  doneTasks,
  paceSteps,
  prepareFixture,
  prepareReplay,
  readReplay,
  readSprintTasks,
  simulateRun,
  startSimulatedProject,
  withStartLines,
  type PreparedFixture,
  type ScriptStep,
} from '../../scripts/simulate-run.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function prepared(): Promise<PreparedFixture> {
  const fx = await prepareFixture({ freshness: 'as-is' });
  cleanups.push(() => fx.cleanup());
  return fx;
}

/** `sprint gate result summary` per event of a step, joined: a compact view of what a step appends. */
function show(step: ScriptStep): string {
  return step.events.map((e) => `${e.sprint} ${e.gate} ${e.result}${e.gate === 'task' ? ` ${e.summary}` : ` #${e.attempt}`}`).join(', ');
}

/** A step's gate lines without the lines added around them. */
const isGateStep = (step: ScriptStep): boolean => step.events.some((e) => e.gate !== 'task' && !(e.gate === 'implement' && e.result === 'start'));

describe('doneTasks', () => {
  it('reads the done list of an implement summary', () => {
    expect(doneTasks('done 1,2,3 — Note editor saves on blur')).toEqual([1, 2, 3]);
    expect(doneTasks('done 1,3; blocked 2 — needs a product call')).toEqual([1, 3]);
    expect(doneTasks('done 4')).toEqual([4]);
    expect(doneTasks('retry 1: fixed the overflow — done 1,2 by hand')).toEqual([]);
    expect(doneTasks('')).toEqual([]);
  });
});

describe('buildRun', () => {
  it('leaves buildScript as the gate lines only', () => {
    for (const name of ['retry', 'escalation', 'none'] as const) {
      const events = buildScript(name).flatMap((s) => s.events);
      expect(events.some((e) => e.gate === 'task' || e.result === 'start')).toBe(false);
    }
  });

  it('keeps every gate step of the script, in order, and adds only start and task lines', () => {
    for (const name of ['retry', 'escalation'] as const) {
      const run = buildRun(name);
      expect(run.filter(isGateStep)).toEqual(buildScript(name));
      const added = run.filter((s) => !isGateStep(s)).flatMap((s) => s.events);
      expect(added.every((e) => e.gate === 'task' || (e.gate === 'implement' && e.result === 'start'))).toBe(true);
    }
    expect(buildRun('none')).toEqual([]);
  });

  it('retry: each implementation run is led by its start line, and the first one by its task lines', () => {
    expect(buildRun('retry').map(show)).toEqual([
      '2.2 implement start #1, 2.3 implement start #1',
      '2.2 task start 1, 2.3 task start 1',
      '2.2 task pass 1, 2.2 task start 2, 2.3 task pass 1, 2.3 task start 2',
      '2.2 task pass 2, 2.2 task start 3, 2.3 task pass 2, 2.3 task start 3',
      '2.2 task pass 3, 2.3 task pass 3',
      '2.2 implement pass #1, 2.3 implement pass #1',
      '2.2 verify pass #1, 2.3 verify fail #1',
      // The retry has a start line and no task lines.
      '2.3 implement start #2',
      '2.3 implement pass #2',
      '2.2 verify pass #2, 2.3 verify pass #2',
      '2.2 wave_test pass #1, 2.3 wave_test pass #1',
      '2.2 doc_sync pass #1, 2.3 doc_sync pass #1',
      '2.4 implement start #1',
      '2.4 task start 1',
      '2.4 task pass 1, 2.4 task start 2',
      '2.4 task pass 2, 2.4 task start 3',
      '2.4 task pass 3',
      '2.4 implement pass #1',
      '2.4 verify pass #1',
      '2.4 doc_sync pass #1',
    ]);
  });

  it('task lines carry the start line attempt and max, and the task number alone', () => {
    const tasks = buildRun('retry').flatMap((s) => s.events).filter((e) => e.gate === 'task');
    expect(tasks).toHaveLength(18);
    for (const e of tasks) {
      expect(e).toMatchObject({ phase: 2, attempt: 1, max: 3 });
      expect(e.summary).toMatch(/^[123]$/);
      expect(e.files).toBeUndefined();
    }
  });
});

describe('addTaskLines', () => {
  const line = (sprint: string, gate: ScriptStep['events'][number]['gate'], result: ScriptStep['events'][number]['result'], summary = '', attempt = 1) => ({
    phase: 2,
    wave: 2,
    sprint,
    gate,
    result,
    attempt,
    max: gate === 'doc_sync' ? 1 : 3,
    summary,
  });

  it('adds nothing without a start line, without a result, or without a done list', () => {
    const noStart: ScriptStep[] = [{ events: [line('2.2', 'implement', 'pass', 'done 1,2')] }];
    expect(addTaskLines(noStart)).toEqual(noStart);
    const noResult: ScriptStep[] = [{ events: [line('2.2', 'implement', 'start')] }, { events: [line('2.3', 'implement', 'pass', 'done 1')] }];
    expect(addTaskLines(noResult)).toEqual(noResult);
    const noList: ScriptStep[] = [{ events: [line('2.2', 'implement', 'start')] }, { events: [line('2.2', 'implement', 'pass', 'all good')] }];
    expect(addTaskLines(noList)).toEqual(noList);
    expect(addTaskLines([])).toEqual([]);
  });

  it('leaves a retry and a sprint that already has task lines alone', () => {
    const retry: ScriptStep[] = [
      { events: [line('2.2', 'implement', 'start', '', 2)] },
      { events: [line('2.2', 'implement', 'pass', 'done 1,2', 2)] },
    ];
    expect(addTaskLines(retry)).toEqual(retry);
    const logged: ScriptStep[] = [
      { events: [line('2.2', 'implement', 'start')] },
      { events: [line('2.2', 'task', 'start', '1')] },
      { events: [line('2.2', 'implement', 'pass', 'done 1,2')] },
    ];
    expect(addTaskLines(logged)).toEqual(logged);
  });

  it('skips the tasks the result lists as blocked, and does not change the steps it was given', () => {
    const steps: ScriptStep[] = [
      { events: [line('2.2', 'implement', 'start')] },
      { events: [line('2.2', 'implement', 'blocked', 'done 1,3; blocked 2 — needs a product call')] },
    ];
    const before = JSON.stringify(steps);
    expect(addTaskLines(steps).map(show)).toEqual([
      '2.2 implement start #1',
      '2.2 task start 1',
      '2.2 task pass 1, 2.2 task start 3',
      '2.2 task pass 3',
      '2.2 implement blocked #1',
    ]);
    expect(JSON.stringify(steps)).toBe(before);
  });

  it('spreads timed fillers evenly through the implement gap, so a paced replay keeps its length', () => {
    const at = (min: number): number => Date.parse(`2026-09-28T14:${String(min).padStart(2, '0')}:00Z`);
    const steps: ScriptStep[] = [
      { at: at(0), events: [line('2.2', 'implement', 'start')] },
      { at: at(8), events: [line('2.2', 'implement', 'pass', 'done 1,2,3')] },
      { at: at(9), events: [line('2.2', 'verify', 'pass')] },
    ];
    const out = addTaskLines(steps);
    expect(out.map((s) => (s.filler ? 'filler' : s.events[0]!.gate))).toEqual(['implement', 'filler', 'filler', 'filler', 'filler', 'implement', 'verify']);
    // Four fillers at 1/5 … 4/5 of the 8 minutes.
    expect(out.map((s) => (s.at! - at(0)) / 1000)).toEqual([0, 96, 192, 288, 384, 480, 540]);
    // At 60×: 8 min is capped at 4 s whether or not the fillers are there; they split it.
    expect(paceSteps(out, 60, 4_000).map((w) => Math.round(w))).toEqual([0, 800, 1_600, 2_400, 3_200, 4_000, 5_000]);
    expect(paceSteps(steps, 60, 4_000)).toEqual([0, 4_000, 5_000]);
  });
});

describe('withStartLines', () => {
  it('puts one start line before every implement result, with its sprint, wave and attempt', () => {
    const starts = withStartLines(buildScript('escalation'))
      .flatMap((s) => s.events)
      .filter((e) => e.gate === 'implement' && e.result === 'start');
    expect(starts.map((e) => [e.wave, e.sprint, e.attempt, e.summary])).toEqual([
      [2, '2.2', 1, ''],
      [2, '2.3', 1, ''],
      [2, '2.3', 2, ''],
      [3, '2.4', 1, ''],
      [3, '2.4', 2, ''],
      [3, '2.4', 3, ''],
    ]);
  });
});

describe('simulateRun with task lines', () => {
  it('retry: the reader takes every line, each task ends built, and the gates read as before', async () => {
    const sim = await startSimulatedProject({ freshness: 'as-is', script: 'retry', intervalMs: 1, startDelayMs: 0 });
    cleanups.push(() => sim.close());
    await sim.simulation.done;

    const project = await loadProject(sim.fixture.root);
    expect(project.warnings).toEqual([]);
    const runs = project.runs.find((r) => r.phase === 2)!;
    expect(runs.events.filter((e) => e.gate === 'task')).toHaveLength(18);
    expect(runs.waves.map((w) => w.wave)).toEqual([1, 2, 3]);
    for (const id of ['2.2', '2.3', '2.4']) {
      const sr = runs.sprintHistory[id]!.at(-1)!;
      expect(sr.tasks!.map((t) => [t.task, t.state])).toEqual([
        [1, 'built'],
        [2, 'built'],
        [3, 'built'],
      ]);
      expect(sr.state).toBe('done');
      expect(sr.events.some((e) => e.gate === 'task')).toBe(false);
    }
    // Wave 1 (already in the fixture) has no task lines.
    expect('tasks' in runs.sprintHistory['2.1']![0]!).toBe(false);
    // 2.3 retried once; the task lines add no attempt.
    expect(runs.sprintHistory['2.3']![0]!.attempts).toEqual({ implement: 2, verify: 2, wave_test: 1, doc_sync: 1 });
    expect(project.progress.byPhase['2']!.percent).toBe(100);
  });

  it('never touches the phase file: tasks stay to do until doc sync marks them', async () => {
    const fx = await prepared();
    const run = buildRun('retry');
    const upTo = run.findIndex((s) => s.events.some((e) => e.gate === 'implement' && e.result === 'pass'));
    const before = await readFile(path.join(fx.phasesDir, 'Phase-2-Trip-Journal.md'), 'utf8');
    await simulateRun({ root: fx.root, steps: run.slice(0, upTo), intervalMs: 1, startDelayMs: 0 }).done;
    expect(await readFile(path.join(fx.phasesDir, 'Phase-2-Trip-Journal.md'), 'utf8')).toBe(before);
    expect((await readSprintTasks(fx.phasesDir, '2.2')).map((t) => t.status)).toEqual(['—', '—', '—']);

    const project = await loadProject(fx.root);
    expect(project.warnings).toEqual([]);
    expect(project.progress.bySprint['2.2']!.done).toBe(0);
    const sr = project.runs.find((r) => r.phase === 2)!.sprintHistory['2.2']![0]!;
    expect(sr.state).toBe('implementing');
    expect(sr.tasks!.map((t) => t.state)).toEqual(['built', 'built', 'built']);
  });

  it('replay: adds task lines to a log that has start lines and none of its own; taskLines: false plays it as logged', async () => {
    const line = (min: number, gate: string, result: string, summary = '') =>
      JSON.stringify({ v: 1, ts: `2026-09-28T14:${String(min).padStart(2, '0')}:00Z`, phase: 2, wave: 2, sprint: '2.2', gate, result, attempt: 1, max: gate === 'doc_sync' ? 1 : 3, summary });
    const log = [line(0, 'implement', 'start'), line(8, 'implement', 'pass', 'done 1,2,3 — notes'), line(9, 'verify', 'pass', 'criteria 2/2 met'), line(10, 'doc_sync', 'pass', '3 tasks updated')].join('\n');
    const origin = Date.parse('2026-10-01T09:00:00Z');
    const gates = async (fx: PreparedFixture): Promise<string[]> => {
      const text = await readFile(path.join(fx.runsDir, 'phase-2.jsonl'), 'utf8');
      return text.trimEnd().split('\n').map((l) => {
        const e = JSON.parse(l) as { gate: string; result: string; summary: string; ts: string };
        return `${e.ts.slice(11, 19)} ${e.gate} ${e.result}${e.gate === 'task' ? ` ${e.summary}` : ''}`;
      });
    };

    const fx = await prepared();
    const file = path.join(fx.root, 'replay.jsonl');
    await writeFile(file, log, 'utf8');
    const steps = await prepareReplay(fx.root, await readReplay(file), { origin });
    await simulateRun({ root: fx.root, steps, speed: 1_000_000, origin, startDelayMs: 0 }).done;
    expect(await gates(fx)).toEqual([
      '09:00:00 implement start',
      '09:01:36 task start 1',
      '09:03:12 task pass 1',
      '09:03:12 task start 2',
      '09:04:48 task pass 2',
      '09:04:48 task start 3',
      '09:06:24 task pass 3',
      '09:08:00 implement pass',
      '09:09:00 verify pass',
      '09:10:00 doc_sync pass',
    ]);
    const project = await loadProject(fx.root);
    expect(project.warnings).toEqual([]);
    expect(project.progress.bySprint['2.2']!.percent).toBe(100);

    const plain = await prepared();
    const again = await prepareReplay(plain.root, await readReplay(file), { origin });
    await simulateRun({ root: plain.root, steps: again, speed: 1_000_000, origin, startDelayMs: 0, taskLines: false }).done;
    expect(await gates(plain)).toEqual(['09:00:00 implement start', '09:08:00 implement pass', '09:09:00 verify pass', '09:10:00 doc_sync pass']);
  });
});
