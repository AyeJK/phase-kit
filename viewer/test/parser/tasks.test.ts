import { describe, expect, it } from 'vitest';
import { splitLines } from '../../src/core/parser/lines.js';
import { isSeparatorRow, looksLikeDoc, parseTaskTable, splitRow } from '../../src/core/parser/tasks.js';

const FILE = 'Phase-9-Test.md';
const table = (...rows: string[]) => parseTaskTable(splitLines(rows.join('\n')), FILE);
const HEADER = ['| Status | # | Task | Module | Reference |', '|--------|---|------|--------|-----------|'];

describe('splitRow', () => {
  it('splits a closed row', () => {
    expect(splitRow('| x | 1 | Task | src/a.ts |')).toEqual({ cells: [' x ', ' 1 ', ' Task ', ' src/a.ts '], closed: true });
  });

  it('reports a row with no closing pipe', () => {
    expect(splitRow('| — | 2 | Task | src/b.ts')).toEqual({ cells: [' — ', ' 2 ', ' Task ', ' src/b.ts'], closed: false });
  });

  it('does not split on an escaped pipe, and unescapes it', () => {
    expect(splitRow('| x | 1 | a \\| b | src |').cells).toEqual([' x ', ' 1 ', ' a | b ', ' src ']);
  });

  it('does not split on pipes inside inline code', () => {
    expect(splitRow('| x | 1 | run `a | b` now | src |').cells).toEqual([' x ', ' 1 ', ' run `a | b` now ', ' src ']);
    expect(splitRow('| x | 1 | ``a | `b` | c`` | src |').cells).toEqual([' x ', ' 1 ', ' ``a | `b` | c`` ', ' src ']);
  });

  it('treats an unmatched backtick as literal', () => {
    expect(splitRow('| x | 1 | lone ` tick | src |').cells).toEqual([' x ', ' 1 ', ' lone ` tick ', ' src ']);
  });

  it('handles escaped pipes inside inline code (real phase-file row)', () => {
    const row =
      "| — | 1 | Watch `docs/phases/` and emit `{ kind: 'phase' \\| 'run' \\| 'design', file }` | src/server/watch.ts |";
    const { cells, closed } = splitRow(row);
    expect(closed).toBe(true);
    expect(cells.map((c) => c.trim())).toEqual([
      '—',
      '1',
      "Watch `docs/phases/` and emit `{ kind: 'phase' | 'run' | 'design', file }`",
      'src/server/watch.ts',
    ]);
  });
});

describe('isSeparatorRow', () => {
  it('recognizes separators', () => {
    expect(isSeparatorRow(splitRow('|---|:--:|---:|').cells)).toBe(true);
    expect(isSeparatorRow(splitRow('| - | 4 | Hyphen | src |').cells)).toBe(false);
  });
});

describe('looksLikeDoc', () => {
  for (const cell of ['docs/api.md', 'docs/design/screens/settings.md', 'README.md', 'notes.txt', 'spec.html', 'docs/api.md#errors', 'docs/images/', '`docs/x.md`']) {
    it(`${cell} is a doc`, () => expect(looksLikeDoc(cell)).toBe(true));
  }
  for (const cell of ['src/api/retry.ts', 'db/migrations/', 'src/c', 'src/md.ts', 'scripts/seed.ts']) {
    it(`${cell} is not a doc`, () => expect(looksLikeDoc(cell)).toBe(false));
  }
});

describe('parseTaskTable', () => {
  it('returns nothing for a section with no table', () => {
    expect(table('', 'Just prose.', '')).toEqual({ value: { tasks: [], legacyTable: false }, warnings: [] });
  });

  it('maps canonical, 4-cell and 3-cell rows', () => {
    const { value, warnings } = table(
      ...HEADER,
      '| x | 1 | Both | src/a.ts | docs/a.md |',
      '| ~ | 2 | Module only | src/b.ts |',
      '| — | 3 | Reference only | docs/c.md |',
      '| BLOCKED | 4 | Neither |',
      '| CUT | 5 | Placeholder module | — | docs/d.md |',
    );
    expect(warnings).toEqual([]);
    expect(value.legacyTable).toBe(false);
    expect(value.tasks.map((t) => [t.number, t.status, t.module, t.reference, t.line])).toEqual([
      [1, 'done', 'src/a.ts', 'docs/a.md', 3],
      [2, 'active', 'src/b.ts', null, 4],
      [3, 'todo', null, 'docs/c.md', 5],
      [4, 'blocked', null, null, 6],
      [5, 'cut', null, 'docs/d.md', 7],
    ]);
  });

  it('reads MANUAL in any case as manual, with no warning', () => {
    const { value, warnings } = table(
      ...HEADER,
      '| MANUAL | 1 | Publish to npm | — |',
      '| manual | 2 | Reinstall the plugin | — |',
    );
    expect(warnings).toEqual([]);
    expect(value.tasks.map((t) => [t.status, t.rawStatus])).toEqual([
      ['manual', 'MANUAL'],
      ['manual', 'manual'],
    ]);
  });

  it('reads a legacy table with no Status column', () => {
    const { value, warnings } = table(
      '| # | Task | Module | Reference |',
      '|---|------|--------|-----------|',
      '| 1 | First | src/a.ts | docs/a.md |',
      '| 2 | Second |',
    );
    expect(warnings).toEqual([]);
    expect(value.legacyTable).toBe(true);
    expect(value.tasks).toEqual([
      { number: 1, text: 'First', status: 'todo', rawStatus: null, legacy: true, module: 'src/a.ts', reference: 'docs/a.md', line: 3 },
      { number: 2, text: 'Second', status: 'todo', rawStatus: null, legacy: true, module: null, reference: null, line: 4 },
    ]);
  });

  it('maps columns from the header, whatever their order', () => {
    const { value } = table('| # | Status | Task |', '|---|---|---|', '| 7 | x | Reordered |');
    expect(value.tasks[0]).toMatchObject({ number: 7, status: 'done', text: 'Reordered', module: null, reference: null });
  });

  it('keeps a row with an unrecognized status and warns exactly once', () => {
    const { value, warnings } = table(...HEADER, '| WIP | 1 | Mystery | src/a.ts |');
    expect(value.tasks).toHaveLength(1);
    expect(value.tasks[0]).toMatchObject({ status: 'unknown', rawStatus: 'WIP', text: 'Mystery' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ file: FILE, line: 3, raw: '| WIP | 1 | Mystery | src/a.ts |' });
    expect(warnings[0]!.message).toContain('WIP');
  });

  it('keeps a row with no closing pipe and warns', () => {
    const { value, warnings } = table(...HEADER, '| — | 1 | Open | src/a.ts');
    expect(value.tasks[0]).toMatchObject({ number: 1, text: 'Open', module: 'src/a.ts' });
    expect(warnings.map((w) => w.line)).toEqual([3]);
  });

  it('warns about text directly after the table and does not treat it as a task', () => {
    const { value, warnings } = table(...HEADER, '| x | 1 | Row | src/a.ts |', 'Trailing prose');
    expect(value.tasks).toHaveLength(1);
    expect(warnings.map((w) => [w.line, w.raw])).toEqual([[4, 'Trailing prose']]);
  });

  it('stops at a blank line without warning', () => {
    const { value, warnings } = table(...HEADER, '| x | 1 | Row | src/a.ts |', '', 'Prose after a gap', '| x | 2 | Second table |');
    expect(value.tasks).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('warns about extra cells and ignores them', () => {
    const { value, warnings } = table(...HEADER, '| x | 1 | Row | src/a.ts | docs/a.md | extra |');
    expect(value.tasks[0]).toMatchObject({ module: 'src/a.ts', reference: 'docs/a.md' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.line).toBe(3);
  });

  it('gives a non-integer # cell a null number', () => {
    const { value } = table(...HEADER, '| x | 1a | Row |', '| x |  | Row two |');
    expect(value.tasks.map((t) => t.number)).toEqual([null, null]);
  });

  it('falls back to the canonical column order when the header has no Task column', () => {
    const { value, warnings } = table('| A | B | C |', '|---|---|---|', '| x | 1 | Row |');
    expect(value.tasks[0]).toMatchObject({ status: 'done', number: 1, text: 'Row' });
    expect(warnings.map((w) => w.line)).toEqual([1]);
  });

  it('skips blank rows and repeated separators', () => {
    const { value, warnings } = table(...HEADER, '|  |  |  |', '|---|---|---|', '| x | 1 | Row |');
    expect(value.tasks.map((t) => t.line)).toEqual([5]);
    expect(warnings).toEqual([]);
  });
});
