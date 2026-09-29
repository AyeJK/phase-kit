import { describe, expect, it } from 'vitest';
import { SPARSE_ROWS } from '../fixtures/index.js';
import { TASK_KEYS, allTasks, parseFixture, taskShape } from './helpers.js';

describe('parsePhaseFile: sparse-rows', () => {
  const fx = parseFixture(SPARSE_ROWS.phaseFiles[0]!);
  const [every, refOnly] = fx.phase.sprints;

  it('parses with no warnings', () => {
    expect(fx.warnings).toEqual([]);
    expect(fx.phase.sprints.map((s) => s.id)).toEqual(['1.1', '1.2']);
  });

  it('maps 5-, 4- and 3-cell rows under a five-column header', () => {
    expect(every!.tasks.map((t) => [t.number, t.status, t.module, t.reference])).toEqual([
      [1, 'done', 'src/api/client.ts', 'docs/api.md'],
      [2, 'done', 'src/api/retry.ts', null],
      [3, 'active', null, null],
      // 4-cell row whose last cell looks like a doc: a Reference, not a Module.
      [4, 'todo', null, 'docs/design/screens/settings.md'],
      // `—` placeholder Module.
      [5, 'todo', null, 'docs/api.md#errors'],
    ]);
  });

  it('maps a Status | # | Task | Reference header', () => {
    expect(refOnly!.legacyTable).toBe(false);
    expect(refOnly!.tasks.map((t) => [t.number, t.text, t.module, t.reference])).toEqual([
      [1, 'Write the API guide', null, 'docs/api.md'],
      [2, 'Review the guide with support', null, null],
    ]);
  });

  it('sparse rows have the same Task shape as canonical rows', () => {
    for (const task of allTasks(fx.phase)) {
      expect(Object.keys(taskShape(task))).toEqual(TASK_KEYS);
      expect(taskShape(task)).toMatchObject({ number: 'number', text: 'string', status: 'string', rawStatus: 'string', legacy: 'boolean', line: 'number' });
    }
  });
});
