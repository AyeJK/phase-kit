import { describe, expect, it } from 'vitest';
import { TASK_STATUSES } from '../../src/core/model.js';
import { MULTI_PHASE } from '../fixtures/index.js';
import { allTasks, parseFixture } from './helpers.js';

describe('parsePhaseFile: multi-phase', () => {
  const parsed = MULTI_PHASE.phaseFiles.map(parseFixture);
  const [p1, p2, p3] = parsed.map((fx) => fx.phase);

  it('parses every phase file with no warnings', () => {
    for (const fx of parsed) expect(fx.warnings).toEqual([]);
  });

  it('reads phase headers and sprint ids', () => {
    expect(parsed.map((fx) => [fx.phase.number, fx.phase.title])).toEqual([
      [1, 'Foundations'],
      [2, 'Library UI'],
      [3, 'Sharing'],
    ]);
    expect(parsed.map((fx) => fx.phase.sprints.map((s) => s.id))).toEqual([
      ['1.1', '1.2'],
      ['2.1', '2.2', '2.3'],
      ['3.1', '3.2'],
    ]);
    expect(parsed.flatMap((fx) => fx.phase.sprints)).toHaveLength(7);
  });

  it('keeps a multi-paragraph intro without the divider', () => {
    expect(p2!.intro).toBe(
      'The pages people use every day: the library grid, shelf pages and search.\n\nThis phase is in progress, so its sprints mix every task status.',
    );
  });

  it('covers all seven canonical statuses and nothing unknown', () => {
    const statuses = new Set(parsed.flatMap((fx) => allTasks(fx.phase).map((t) => t.status)));
    expect([...statuses].sort()).toEqual(TASK_STATUSES.filter((s) => s !== 'unknown').sort());
  });

  it('maps upper-case word statuses and keeps the raw cell', () => {
    const s21 = p2!.sprints[0]!;
    expect(s21.tasks.map((t) => [t.status, t.rawStatus])).toEqual([
      ['done', 'x'],
      ['active', '~'],
      ['blocked', 'BLOCKED'],
      ['todo', '—'],
    ]);
    expect(p2!.sprints[1]!.tasks[2]).toMatchObject({ status: 'cut', rawStatus: 'CUT' });
    expect(p2!.sprints[2]!.tasks[2]).toMatchObject({ status: 'deferred', rawStatus: 'DEFERRED' });
    expect(p3!.sprints[1]!.tasks[2]).toMatchObject({ status: 'manual', rawStatus: 'MANUAL' });
  });

  it('reads module, reference and inline code', () => {
    expect(p1!.sprints[0]!.tasks[0]).toEqual({
      number: 1,
      text: 'Add `books` table (title, author, isbn, added_at)',
      status: 'done',
      rawStatus: 'x',
      legacy: false,
      module: 'db/migrations/',
      reference: 'docs/spec.md#books',
      line: 17,
    });
    expect(p3!.sprints[1]!.tasks[2]).toMatchObject({ number: 3, module: null, reference: null, line: 55 });
  });

  it('reads goals and sprint line ranges', () => {
    expect(p3!.sprints.map((s) => [s.goal, s.line, s.endLine])).toEqual([
      ["Share a read-only link to one shelf.", 7, 41],
      ['A stats page: books per month, pages per year.', 43, 70],
    ]);
    // A trailing `##` section ends the last sprint.
    expect(p1!.sprints[1]!.endLine).toBe(64);
  });
});
