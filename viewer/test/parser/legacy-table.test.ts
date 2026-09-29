import { describe, expect, it } from 'vitest';
import { LEGACY_TABLE } from '../fixtures/index.js';
import { TASK_KEYS, allTasks, parseFixture, taskShape } from './helpers.js';

describe('parsePhaseFile: legacy-table', () => {
  const fx = parseFixture(LEGACY_TABLE.phaseFiles[0]!);
  const [legacy, migrated] = fx.phase.sprints;

  it('parses with no warnings', () => {
    expect(fx.warnings).toEqual([]);
    expect(fx.phase.sprints.map((s) => s.id)).toEqual(['1.1', '1.2']);
  });

  it('marks the table without a Status column as legacy, every task todo', () => {
    expect(legacy!.legacyTable).toBe(true);
    expect(legacy!.tasks).toEqual([
      { number: 1, text: 'Parse the config file', status: 'todo', rawStatus: null, legacy: true, module: 'src/config.ts', reference: 'docs/config.md', line: 17 },
      { number: 2, text: 'Validate required keys', status: 'todo', rawStatus: null, legacy: true, module: 'src/config.ts', reference: null, line: 18 },
      { number: 3, text: 'Manual check on a real config', status: 'todo', rawStatus: null, legacy: true, module: null, reference: null, line: 19 },
    ]);
  });

  it('reads the migrated table normally', () => {
    expect(migrated!.legacyTable).toBe(false);
    expect(migrated!.tasks.map((t) => [t.status, t.rawStatus, t.legacy, t.module, t.reference])).toEqual([
      ['done', 'x', false, 'src/env.ts', null],
      // Five cells: README.md stays in the Module column even though it looks like a doc.
      ['todo', '—', false, 'README.md', 'docs/config.md'],
    ]);
  });

  it('legacy rows have the same Task shape as canonical rows', () => {
    const canonical = taskShape(migrated!.tasks[1]!);
    expect(Object.keys(canonical)).toEqual(TASK_KEYS);
    for (const task of allTasks(fx.phase)) {
      expect(Object.keys(taskShape(task))).toEqual(TASK_KEYS);
    }
    // Same keys and, where both are set, the same value types.
    expect(taskShape(legacy!.tasks[0]!)).toEqual({ ...canonical, rawStatus: 'null' });
  });
});
