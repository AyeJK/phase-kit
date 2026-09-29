import { describe, expect, it } from 'vitest';
import { splitLines } from '../../src/core/parser/lines.js';
import {
  extractDependencyRefs,
  parseAcceptanceCriteria,
  parseDependencies,
  parseListItems,
} from '../../src/core/parser/sections.js';

const body = (...lines: string[]) => splitLines(lines.join('\n'));

describe('parseListItems', () => {
  it('reads -, *, + and numbered bullets, flattening nested ones', () => {
    const items = parseListItems(body('- one', '* two', '+ three', '1. four', '2) five', '  - nested'));
    expect(items.map((i) => [i.text, i.bullet, i.indent, i.line.line])).toEqual([
      ['one', true, 0, 1],
      ['two', true, 0, 2],
      ['three', true, 0, 3],
      ['four', true, 0, 4],
      ['five', true, 0, 5],
      ['nested', true, 2, 6],
    ]);
  });

  it('joins indented continuation lines and keeps each unindented line as its own item', () => {
    const items = parseListItems(
      body('- first', '  wrapped tail', '', '  indented after blank', '', 'cli: npm test', 'skip-ui: true', '---', '- after break'),
    );
    expect(items.map((i) => [i.text, i.bullet, i.line.line])).toEqual([
      ['first wrapped tail indented after blank', true, 1],
      ['cli: npm test', false, 6],
      ['skip-ui: true', false, 7],
      ['after break', true, 9],
    ]);
  });

  it('never reads a divider or bold text as a bullet, and drops empty bullets', () => {
    expect(parseListItems(body('---', '- - -', '* * *', '-', '**Bold** line')).map((i) => i.text)).toEqual(['**Bold** line']);
  });
});

describe('parseAcceptanceCriteria', () => {
  it('strips checkboxes into checked and keeps plain bullets as null', () => {
    expect(parseAcceptanceCriteria(body('- [ ] open', '- [x] done', '- [X] also done', '- plain', '* star', '- [ ]'))).toEqual([
      { text: 'open', checked: false, line: 1 },
      { text: 'done', checked: true, line: 2 },
      { text: 'also done', checked: true, line: 3 },
      { text: 'plain', checked: null, line: 4 },
      { text: 'star', checked: null, line: 5 },
    ]);
  });

  it('keeps inline markdown and a link-like [text] that is not a checkbox', () => {
    expect(parseAcceptanceCriteria(body('- [link](x.md) renders `code`'))).toEqual([
      { text: '[link](x.md) renders `code`', checked: null, line: 1 },
    ]);
  });

  it('returns nothing for an empty section', () => {
    expect(parseAcceptanceCriteria(body('', ''))).toEqual([]);
  });
});

describe('extractDependencyRefs', () => {
  const cases: [string, string[], number[]][] = [
    ['Sprint 1.1', ['1.1'], []],
    ['Sprint 3.1, Sprint 1.1', ['3.1', '1.1'], []],
    ['Sprints 1.2 and 1.3', ['1.2', '1.3'], []],
    ['Sprint 1.2, 1.3 & 1.4', ['1.2', '1.3', '1.4'], []],
    ['sprint 2.10 (lowercase)', ['2.10'], []],
    ['Phase 1 (run-log emission installed, so this run is logged)', [], [1]],
    ['Phases 2 and 3', [], [2, 3]],
    ['Phase 4, Sprint 1.3 (design pass: `docs/design/design-system.md` exists)', ['1.3'], [4]],
    ['Sprint 1.3 (needs the Phase 2 schema and Sprint 9.9)', ['1.3'], []],
    ['Sprint 1.1 and Sprint 1.1 again', ['1.1'], []],
    ['Phase 1.2 is not a phase', [], []],
    ['Needs node 20.1 or later', [], []],
    ['1.2', [], []],
    ['External API key from ops', [], []],
    ['`Sprint 5.5` in code is a note', [], []],
    ['Sprint 1.1 (unclosed note about Sprint 2.2', ['1.1'], []],
  ];
  it.each(cases)('%s', (text, sprints, phases) => {
    expect(extractDependencyRefs(text)).toEqual({ sprints, phases });
  });
});

describe('parseDependencies', () => {
  it('keeps raw text and marks None as empty', () => {
    expect(parseDependencies(body('- None', '- none.', '- N/A', '- —', '- None (standalone)'))).toEqual([
      { raw: 'None', sprints: [], phases: [], none: true, line: 1 },
      { raw: 'none.', sprints: [], phases: [], none: true, line: 2 },
      { raw: 'N/A', sprints: [], phases: [], none: true, line: 3 },
      { raw: '—', sprints: [], phases: [], none: true, line: 4 },
      { raw: 'None (standalone)', sprints: [], phases: [], none: true, line: 5 },
    ]);
  });

  it('reads ids per bullet and keeps prose-only bullets without warnings', () => {
    expect(parseDependencies(body('- Phase 1 (import done)', '- Sprint 3.1, Sprint 1.1', '- Waiting on legal review'))).toEqual([
      { raw: 'Phase 1 (import done)', sprints: [], phases: [1], none: false, line: 1 },
      { raw: 'Sprint 3.1, Sprint 1.1', sprints: ['3.1', '1.1'], phases: [], none: false, line: 2 },
      { raw: 'Waiting on legal review', sprints: [], phases: [], none: false, line: 3 },
    ]);
  });

  it('reads a paragraph with no bullet', () => {
    expect(parseDependencies(body('None'))).toEqual([{ raw: 'None', sprints: [], phases: [], none: true, line: 1 }]);
  });
});
