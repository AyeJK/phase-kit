import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Phase, Progress, Task, TaskStatus } from '../../src/core/model.js';
import { TASK_STATUSES } from '../../src/core/model.js';
import { deriveProgress, taskProgress } from '../../src/core/derive/progress.js';
import { parsePhaseFile } from '../../src/core/parser/phase.js';
import { MULTI_PHASE, SAMPLE_PROJECT } from '../fixtures/index.js';

function parse(file: string): Phase {
  return parsePhaseFile(readFileSync(file, 'utf8'), file).phase;
}

/** A Progress with the given status counts (every other status 0). */
function progress(counts: Partial<Record<TaskStatus, number>>, done: number, eligible: number, percent: number): Progress {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, counts[s] ?? 0])) as Record<TaskStatus, number>;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { total, eligible, done, percent, byStatus };
}

function task(status: TaskStatus): Task {
  return { number: 1, text: 't', status, rawStatus: null, legacy: false, module: null, reference: null, line: 1 };
}

describe('deriveProgress: multi-phase', () => {
  const phases = MULTI_PHASE.phaseFiles.map(parse);
  const p = deriveProgress(phases);

  it('counts per sprint, excluding CUT and DEFERRED from the denominator', () => {
    expect(p.bySprint['1.1']).toEqual(progress({ done: 3 }, 3, 3, 100));
    expect(p.bySprint['1.2']).toEqual(progress({ done: 3 }, 3, 3, 100));
    expect(p.bySprint['2.1']).toEqual(progress({ done: 1, active: 1, blocked: 1, todo: 1 }, 1, 4, 25));
    expect(p.bySprint['2.2']).toEqual(progress({ todo: 2, cut: 1 }, 0, 2, 0));
    expect(p.bySprint['2.3']).toEqual(progress({ todo: 2, deferred: 1 }, 0, 2, 0));
    expect(p.bySprint['3.1']).toEqual(progress({ todo: 2, deferred: 1 }, 0, 2, 0));
    // MANUAL counts as eligible and not done.
    expect(p.bySprint['3.2']).toEqual(progress({ todo: 2, manual: 1 }, 0, 3, 0));
    expect(Object.keys(p.bySprint)).toHaveLength(7);
  });

  it('counts per phase', () => {
    expect(p.byPhase['1']).toEqual(progress({ done: 6 }, 6, 6, 100));
    // 1 of 8 eligible (10 tasks minus 1 cut and 1 deferred) → 12.5 → 13.
    expect(p.byPhase['2']).toEqual(progress({ done: 1, active: 1, blocked: 1, todo: 5, cut: 1, deferred: 1 }, 1, 8, 13));
    expect(p.byPhase['3']).toEqual(progress({ todo: 4, manual: 1, deferred: 1 }, 0, 5, 0));
  });

  it('counts overall', () => {
    // 22 tasks, 1 cut + 2 deferred → 19 eligible, 7 done → 36.8 → 37.
    expect(p.overall).toEqual(
      progress({ done: 7, active: 1, blocked: 1, manual: 1, todo: 9, cut: 1, deferred: 2 }, 7, 19, 37),
    );
    expect(p.overall.total).toBe(22);
  });

  it('reports deferred and cut counts', () => {
    expect(p.deferred).toBe(2);
    expect(p.cut).toBe(1);
  });

  it('picks the next-up sprint: first with a todo or active task, lowest phase first', () => {
    expect(p.nextUp).toEqual({ phase: 2, sprint: '2.1', title: 'Library Grid' });
    expect(deriveProgress([...phases].reverse()).nextUp).toEqual(p.nextUp);
  });

  it('lists blocked tasks with their location', () => {
    expect(p.blocked).toEqual([
      {
        phase: 2,
        sprint: '2.1',
        number: 3,
        text: 'Cover images from Open Library (API key pending)',
        file: MULTI_PHASE.phaseFiles[1],
        line: 21,
      },
    ]);
    const lines = readFileSync(MULTI_PHASE.phaseFiles[1]!, 'utf8').split(/\r?\n/);
    expect(lines[20]).toMatch(/^\| BLOCKED \| 3 \|/);
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('deriveProgress: other inputs', () => {
  it('sample project is complete with nothing next', () => {
    const p = deriveProgress(SAMPLE_PROJECT.phaseFiles.map(parse));
    expect(p.overall).toEqual(progress({ done: 7 }, 7, 7, 100));
    expect(p.nextUp).toBeNull();
    expect(p.blocked).toEqual([]);
  });

  it('no phases → zero everything', () => {
    const p = deriveProgress([]);
    expect(p.overall).toEqual(progress({}, 0, 0, 0));
    expect(p).toMatchObject({ byPhase: {}, bySprint: {}, nextUp: null, blocked: [], deferred: 0, cut: 0 });
  });

  it('taskProgress: nothing eligible → 0 percent; unknown counts as eligible', () => {
    expect(taskProgress([task('cut'), task('deferred')])).toEqual(progress({ cut: 1, deferred: 1 }, 0, 0, 0));
    expect(taskProgress([task('done'), task('unknown')])).toEqual(progress({ done: 1, unknown: 1 }, 1, 2, 50));
  });

  it('taskProgress: manual tasks are eligible and not done, like blocked', () => {
    expect(taskProgress([task('done'), task('manual'), task('blocked'), task('cut')])).toEqual(
      progress({ done: 1, manual: 1, blocked: 1, cut: 1 }, 1, 3, 33),
    );
    // Only manual left: not complete.
    const p = taskProgress([task('done'), task('done'), task('manual')]);
    expect(p.done).toBeLessThan(p.eligible);
    expect(p.percent).toBe(67);
  });

  it('a manual task is not listed as blocked and does not make a sprint next up', () => {
    const phases = MULTI_PHASE.phaseFiles.map(parse);
    for (const phase of phases) for (const s of phase.sprints) for (const t of s.tasks) t.status = 'done';
    phases[1]!.sprints[0]!.tasks[0]!.status = 'manual';
    const p = deriveProgress(phases);
    expect(p.blocked).toEqual([]);
    expect(p.nextUp).toBeNull();
    expect(p.bySprint['2.1']!.byStatus.manual).toBe(1);
    expect(p.byPhase['2']!.done).toBe(p.byPhase['2']!.eligible - 1);
  });

  it('an active task makes a sprint next up', () => {
    const phases = MULTI_PHASE.phaseFiles.map(parse);
    const sprint = phases[1]!.sprints[0]!;
    for (const t of sprint.tasks) if (t.status === 'todo') t.status = 'done';
    expect(deriveProgress(phases).nextUp?.sprint).toBe('2.1');
    for (const t of sprint.tasks) if (t.status === 'active') t.status = 'done';
    expect(deriveProgress(phases).nextUp?.sprint).toBe('2.2');
  });
});
