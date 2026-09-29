import { describe, expect, it } from 'vitest';
import { MIXED_SYMBOLS } from '../fixtures/index.js';
import { expectWarningsQuoteTheirLines, parseFixture } from './helpers.js';

const FILE = MIXED_SYMBOLS.phaseFiles[0]!;

describe('parsePhaseFile: mixed-symbols', () => {
  const fx = parseFixture(FILE);
  const [s1, s2, s3] = fx.phase.sprints;

  it('reads headers with en dash, colon and hyphen separators', () => {
    expect([fx.phase.number, fx.phase.title]).toEqual([1, 'Mixed Symbols']);
    expect(fx.phase.sprints.map((s) => [s.id, s.title])).toEqual([
      ['1.1', 'En Dash Header'],
      ['1.2', 'Colon Header'],
      ['1.3', 'Hyphen Header'],
    ]);
  });

  it('normalizes checkbox and dash statuses', () => {
    expect(s1!.tasks.map((t) => [t.rawStatus, t.status])).toEqual([
      ['[x]', 'done'],
      ['[X]', 'done'],
      ['[ ]', 'todo'],
      ['-', 'todo'],
      ['–', 'todo'],
      ['—', 'todo'],
    ]);
    expect(s3!.tasks.map((t) => t.status)).toEqual(['active']);
  });

  it('normalizes word statuses in any case, and keeps an unknown one', () => {
    expect(s2!.tasks.map((t) => [t.rawStatus, t.status])).toEqual([
      ['X', 'done'],
      ['blocked', 'blocked'],
      ['Cut', 'cut'],
      ['deferred', 'deferred'],
      ['WIP', 'unknown'],
    ]);
    expect(s2!.tasks[4]).toMatchObject({ number: 5, text: 'Unrecognised status word', module: 'src/f.ts', line: 55 });
  });

  it('reads checkbox and asterisk acceptance bullets', () => {
    expect(s1!.acceptanceCriteria).toEqual([
      { text: 'Checkbox criterion, checked', checked: true, line: 26 },
      { text: 'Checkbox criterion, unchecked', checked: false, line: 27 },
      { text: 'Asterisk bullet criterion', checked: null, line: 28 },
    ]);
  });

  it('reads Verification keys in any case', () => {
    expect(s1!.verification).toEqual({ cli: 'npm run check', ui: [], skills: [], viewports: [], skipUi: true, assert: [], extra: {}, line: 34 });
    expect(s2!.verification).toEqual({ cli: 'npm test', ui: [], skills: [], viewports: [], skipUi: true, assert: [], extra: {}, line: 65 });
    expect(s3!.verification).toMatchObject({ cli: 'npm run check', skipUi: false, line: 92 });
  });

  it('reads dependencies', () => {
    expect(fx.phase.sprints.map((s) => s.dependencies.map((d) => [d.raw, d.sprints, d.none]))).toEqual([
      [['None', [], true]],
      [['Sprint 1.1', ['1.1'], false]],
      [['Sprint 1.2', ['1.2'], false]],
    ]);
  });

  it('adds exactly one warning, for the unrecognized status row', () => {
    expect(fx.warnings).toHaveLength(1);
    expect(fx.warnings[0]).toMatchObject({ file: FILE, line: 55, raw: '| WIP | 5 | Unrecognised status word | src/f.ts |' });
    expect(fx.warnings[0]!.message).toContain('WIP');
    expectWarningsQuoteTheirLines(fx, FILE);
  });
});
