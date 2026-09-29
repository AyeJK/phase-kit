import { beforeAll, describe, expect, it } from 'vitest';
import type { Project, Sprint } from '../../src/core/model.js';
import { isUnderModules, modulePaths, normalizePath, sprintHistory } from '../../src/core/derive/history.js';
import { deriveProgress } from '../../src/core/derive/progress.js';
import { deriveRun } from '../../src/core/derive/run.js';
import { loadProject } from '../../src/core/load.js';
import { MULTI_PHASE, MULTI_PHASE_RUN_LOGS, RUN_LOGS } from '../fixtures/index.js';
import { events, fixtureEvents } from './helpers.js';

describe('sprintHistory on the multi-phase project', () => {
  let project: Project;
  beforeAll(async () => {
    project = await loadProject(MULTI_PHASE.root);
  });

  it('lists a sprint’s steps with the wave’s files, Module files first', () => {
    const h = sprintHistory(project, '1.2')!;
    expect(h).not.toBeNull();
    expect(h.sprint).toBe('1.2');
    expect(h.phase).toBe(1);
    expect(h.file).toBe(MULTI_PHASE_RUN_LOGS.phase1);
    expect(h.waves).toHaveLength(1);
    const w = h.waves[0]!;
    expect([w.run, w.wave, w.state]).toEqual([1, 2, 'done']);
    expect(w.steps.map((s) => `${s.gate}:${s.result}:${s.attempt}`)).toEqual([
      'implement:pass:1',
      'verify:fail:1',
      'implement:pass:2',
      'verify:pass:2',
      'doc_sync:pass:1',
    ]);
    // Logged order is README.md first; the sprint's own Module files move ahead of it.
    expect(w.files).toEqual(['src/import/csv.test.ts', 'src/import/csv.ts', 'src/import/dedupe.ts', 'README.md']);
    expect(w.moduleFiles).toEqual(['src/import/csv.test.ts', 'src/import/csv.ts', 'src/import/dedupe.ts']);
    expect(w.filesAt).toBe('2026-09-20T09:21:05Z');
    expect(w.escalation).toBeNull();
    expect(h.steps.map((s) => [s.run, s.wave, s.line])).toEqual([
      [1, 2, 4],
      [1, 2, 5],
      [1, 2, 6],
      [1, 2, 7],
      [1, 2, 8],
    ]);
  });

  it('matches a folder Module path', () => {
    const w = sprintHistory(project, '1.1')!.waves[0]!;
    expect(w.moduleFiles).toEqual(['db/migrations/001_books.sql', 'db/migrations/002_shelves.sql', 'scripts/seed.ts']);
  });

  it('reports "not logged" files as null for a wave without doc_sync', () => {
    const w = sprintHistory(project, '2.1')!.waves[0]!;
    expect(w.state).toBe('testing');
    expect(w.files).toBeNull();
    expect(w.moduleFiles).toEqual([]);
    expect(w.filesAt).toBeNull();
  });

  it('is empty (not null) for a sprint the log never mentions', () => {
    const h = sprintHistory(project, '2.2');
    expect(h).toEqual({ sprint: '2.2', phase: 2, file: MULTI_PHASE_RUN_LOGS.phase2, waves: [], steps: [] });
  });

  it('is null when the phase has no run log', () => {
    expect(sprintHistory(project, '3.1')).toBeNull();
    expect(sprintHistory(project, '9.9')).toBeNull();
    expect(sprintHistory(project, 'nonsense')).toBeNull();
  });

  it('is plain JSON', () => {
    const h = sprintHistory(project, '1.2');
    expect(JSON.parse(JSON.stringify(h))).toEqual(h);
  });
});

/** A project with no phase files and one phase-2 run log. */
function projectWithLog(evts: ReturnType<typeof fixtureEvents>): Project {
  return {
    root: '/p',
    phasesDir: '/p/docs/phases',
    phases: [],
    runs: [{ phase: 2, file: '/p/docs/phases/.runs/phase-2.jsonl', events: evts, ...deriveRun(evts) }],
    hasDesignSystem: false,
    progress: deriveProgress([]),
    warnings: [],
  };
}

describe('sprintHistory across waves and runs', () => {
  it('keeps each wave, oldest first; a later run clears the old escalation', () => {
    const first = fixtureEvents(RUN_LOGS.escalation);
    const second = events(
      [1, '2.5', 'implement', 'pass', 1],
      [1, '2.5', 'verify', 'pass', 1],
      [1, '2.5', 'doc_sync', 'pass', 1],
    ).map((e) => ({ ...e, line: e.line + first.length }));
    const h = sprintHistory(projectWithLog([...first, ...second]), '2.5')!;
    expect(h.waves.map((w) => [w.run, w.wave, w.state])).toEqual([
      [1, 2, 'failed'],
      [2, 1, 'done'],
    ]);
    expect(h.waves[0]!.escalation).toBeNull();
    expect(h.steps).toHaveLength(9);
    expect(h.steps.map((s) => s.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(h.steps.map((s) => s.run)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('carries the escalation while it stands', () => {
    const h = sprintHistory(projectWithLog(fixtureEvents(RUN_LOGS.escalation)), '2.5')!;
    expect(h.waves[0]!.escalation?.attempt).toBe(3);
    expect(h.waves[0]!.escalation?.history).toHaveLength(3);
  });

  it('falls back to the id for the phase when the sprint is not in a phase file', () => {
    const h = sprintHistory(projectWithLog(fixtureEvents(RUN_LOGS.failRetryPass)), '2.4')!;
    expect(h.phase).toBe(2);
    // No Module paths known: files stay in logged order.
    expect(h.waves[0]!.files).toEqual(['src/parser/tables.ts', 'src/parser/tables.test.ts']);
    expect(h.waves[0]!.moduleFiles).toEqual([]);
  });
});

describe('Module path helpers', () => {
  it('normalizes paths for comparison', () => {
    expect(normalizePath(' ./src/core/ ')).toBe('src/core');
    expect(normalizePath('`src\\core\\load.ts`')).toBe('src/core/load.ts');
  });

  it('matches files equal to or inside a Module path', () => {
    const mods = ['src/core', 'db/migrations', 'scripts/seed.ts'];
    expect(isUnderModules('src/core/load.ts', mods)).toBe(true);
    expect(isUnderModules('db/migrations/001.sql', mods)).toBe(true);
    expect(isUnderModules('scripts/seed.ts', mods)).toBe(true);
    expect(isUnderModules('src/core-extra/x.ts', mods)).toBe(false);
    expect(isUnderModules('scripts/seed.ts.bak', mods)).toBe(false);
    expect(isUnderModules('README.md', mods)).toBe(false);
  });

  it('collects distinct Module paths, splitting comma lists', () => {
    const sprint = {
      tasks: [
        { module: 'src/a.ts' },
        { module: null },
        { module: 'src/a.ts, src/b/' },
        { module: '`src/c.ts`' },
      ],
    } as unknown as Sprint;
    expect(modulePaths(sprint)).toEqual(['src/a.ts', 'src/b', 'src/c.ts']);
  });
});
