import { describe, expect, it } from 'vitest';
import { BROKEN, BROKEN_LINES } from '../fixtures/index.js';
import { allTasks, expectWarningsQuoteTheirLines, parseFixture } from './helpers.js';

const FILE = BROKEN.phaseFiles[0]!;

/** Every documented bad line; the recovering sprint header is the one good line in the list. */
const BAD_LINES = Object.entries(BROKEN_LINES)
  .filter(([name]) => name !== 'recoversSprint')
  .map(([, line]) => line)
  .sort((a, b) => a - b);

describe('parsePhaseFile: broken', () => {
  const fx = parseFixture(FILE);

  it('parses without throwing', () => {
    expect(fx.phase.number).toBe(1);
    expect(fx.phase.title).toBe('Broken');
  });

  it('warns exactly once on each documented bad line and nowhere else', () => {
    expect(fx.warnings.map((w) => w.line)).toEqual(BAD_LINES);
    expectWarningsQuoteTheirLines(fx, FILE);
  });

  it('says what is wrong on each bad line', () => {
    const message = (line: number) => fx.warnings.find((w) => w.line === line)?.message ?? '';
    expect(message(BROKEN_LINES.unclosedRow)).toMatch(/closing pipe/);
    expect(message(BROKEN_LINES.truncatedRow)).toMatch(/closing pipe/);
    expect(message(BROKEN_LINES.proseAfterTable)).toMatch(/after the task table/);
    expect(message(BROKEN_LINES.malformedSprintHeader)).toMatch(/N\.M id/);
    expect(message(BROKEN_LINES.missingGoal)).toMatch(/Goal/);
    expect(message(BROKEN_LINES.binaryBytes)).toMatch(/control characters|UTF-8/);
  });

  it('keeps rows 1 to 3 of the unclosed table', () => {
    const s11 = fx.phase.sprints[0]!;
    expect(s11.id).toBe('1.1');
    expect(s11.tasks.map((t) => [t.number, t.status, t.module, t.line])).toEqual([
      [1, 'done', 'src/a.ts', 17],
      [2, 'todo', 'src/b.ts', 18],
      [3, 'todo', 'src/c', 19],
    ]);
    expect(s11.endLine).toBe(30);
  });

  it('skips the sprint with a malformed header, including its orphan task', () => {
    expect(fx.phase.sprints.map((s) => s.id)).toEqual(['1.1', '1.3', '1.4']);
    expect(allTasks(fx.phase).some((t) => t.module === 'src/orphan.ts')).toBe(false);
  });

  it('keeps a sprint with no Goal section', () => {
    const s13 = fx.phase.sprints[1]!;
    expect(s13.goal).toBeNull();
    expect(s13.tasks.map((t) => t.status)).toEqual(['active', 'todo']);
  });

  it('recovers: the last sprint parses cleanly with no warnings inside it', () => {
    const s14 = fx.phase.sprints[2]!;
    expect(s14.line).toBe(BROKEN_LINES.recoversSprint);
    expect(s14.goal).toBe('A well-formed sprint after the damage, to prove parsing recovers.');
    expect(s14.tasks.map((t) => [t.number, t.status, t.module, t.reference])).toEqual([
      [1, 'done', 'src/f.ts', null],
      [2, 'todo', 'src/g.ts', 'docs/spec.md'],
    ]);
    expect(fx.warnings.filter((w) => w.line >= s14.line && w.line <= s14.endLine)).toEqual([]);
  });
});
