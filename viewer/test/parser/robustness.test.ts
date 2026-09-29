import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePhaseFile } from '../../src/core/parser/phase.js';
import { PROJECT_FIXTURES, SAMPLE_PROJECT } from '../fixtures/index.js';

const ALL_PHASE_FILES = Object.values(PROJECT_FIXTURES).flatMap((fx) => fx.phaseFiles);

/** Small deterministic PRNG so the garbage inputs are the same every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('parsePhaseFile never throws', () => {
  it('parses every truncation of every phase fixture', () => {
    for (const file of ALL_PHASE_FILES) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let n = 0; n <= lines.length; n++) {
        const text = lines.slice(0, n).join('\n');
        const { phase, warnings } = parsePhaseFile(text, file);
        expect(phase.file).toBe(file);
        for (const w of warnings) {
          expect(w.file).toBe(file);
          expect(w.line).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('parses random markdown-ish garbage', () => {
    const rand = lcg(42);
    const alphabet = ['#', '# ', '## ', '### ', '|', ' | ', '`', '```', '\\', '\n', '\r\n', '—', '-', 'x', '~', 'Sprint ', 'Phase ', '1', '.', '2', ' ', 'a', '\u0000', '�', ':'];
    for (let i = 0; i < 300; i++) {
      let text = '';
      const len = Math.floor(rand() * 400);
      for (let j = 0; j < len; j++) text += alphabet[Math.floor(rand() * alphabet.length)]!;
      expect(() => parsePhaseFile(text, 'Phase-1-Garbage.md')).not.toThrow();
    }
  });

  it('returns a phase with a warning for non-string input', () => {
    const { phase, warnings } = parsePhaseFile(undefined as unknown as string, 'docs/phases/Phase-4-Nothing.md');
    expect(phase.number).toBe(4);
    expect(phase.sprints).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({ file: 'docs/phases/Phase-4-Nothing.md', line: 0, raw: '' }),
    ]);
  });

  it('catches an unexpected error and still returns the phase', () => {
    const hostile = {
      toString() {
        throw new Error('boom');
      },
    };
    const { phase, warnings } = parsePhaseFile(hostile as unknown as string, 'Phase-2-Hostile.md');
    expect(phase.number).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toMatch(/Parser error: boom/);
  });
});

describe('parsePhaseFile input tolerance', () => {
  const lf = readFileSync(SAMPLE_PROJECT.phaseFiles[0]!, 'utf8').replace(/\r\n/g, '\n');
  const file = SAMPLE_PROJECT.phaseFiles[0]!;

  it('parses CRLF line endings to the same model', () => {
    const crlf = parsePhaseFile(lf.replace(/\n/g, '\r\n'), file);
    expect(crlf.warnings).toEqual([]);
    expect(crlf.phase).toEqual(parsePhaseFile(lf, file).phase);
  });

  it('ignores a leading byte-order mark', () => {
    expect(parsePhaseFile(`﻿${lf}`, file)).toEqual(parsePhaseFile(lf, file));
  });

  it('falls back to the file name when there is no phase header', () => {
    const { phase, warnings } = parsePhaseFile('# Sprint 3.1 — Only\n\n### Goal\n\nG\n', 'x/Phase-3-NoHeader.md');
    expect(phase.number).toBe(3);
    expect(phase.line).toBe(0);
    expect(phase.sprints.map((s) => [s.id, s.goal])).toEqual([['3.1', 'G']]);
    expect(warnings.map((w) => w.line)).toEqual([0]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const text = [
      '# Phase 5: Fenced',
      '',
      '```md',
      '# Sprint 9.9 — Not a sprint',
      '```',
      '',
      '# Sprint 5.1 — Real',
      '',
      '### Goal',
      '',
      'Goal text.',
      '',
      '```',
      '### Tasks',
      '```',
    ].join('\n');
    const { phase, warnings } = parsePhaseFile(text, 'Phase-5-Fenced.md');
    expect(warnings).toEqual([]);
    expect(phase.title).toBe('Fenced');
    expect(phase.sprints.map((s) => s.id)).toEqual(['5.1']);
    expect(phase.sprints[0]!.goal).toBe('Goal text.\n\n```\n### Tasks\n```');
    expect(phase.sprints[0]!.tasks).toEqual([]);
  });

  it('does not warn about unknown ### sections or trailing ## sections', () => {
    const text = [
      '# Phase 6 — Quiet',
      '',
      '# Sprint 6.1 — S',
      '',
      '### Goal',
      '',
      'G',
      '',
      '### Notes',
      '',
      'Anything.',
      '',
      '---',
      '',
      '## Scope Guard',
      '',
      'Nothing else.',
      '',
      '## Risk Mitigations',
      '',
      '- One',
    ].join('\n');
    const { phase, warnings } = parsePhaseFile(text, 'Phase-6-Quiet.md');
    expect(warnings).toEqual([]);
    expect(phase.sprints[0]).toMatchObject({ id: '6.1', goal: 'G', line: 3, endLine: 13 });
    expect(phase.sprints[0]!.sections).toEqual([{ heading: 'Notes', level: 3, body: 'Anything.', line: 9 }]);
    expect(phase.trailingSections).toEqual([
      { heading: 'Scope Guard', level: 2, body: 'Nothing else.', line: 15 },
      { heading: 'Risk Mitigations', level: 2, body: '- One', line: 19 },
    ]);
  });

  it('parses only the first section of a kind and keeps a repeat raw, with a warning', () => {
    const text = [
      '# Phase 7 — Twice',
      '',
      '# Sprint 7.1 — S',
      '',
      '### Goal',
      '',
      'First.',
      '',
      '### Goal',
      '',
      'Second.',
    ].join('\n');
    const { phase, warnings } = parsePhaseFile(text, 'Phase-7-Twice.md');
    expect(phase.sprints[0]!.goal).toBe('First.');
    expect(phase.sprints[0]!.sections).toEqual([{ heading: 'Goal', level: 3, body: 'Second.', line: 9 }]);
    expect(warnings).toEqual([expect.objectContaining({ line: 9, raw: '### Goal' })]);
    expect(warnings[0]!.message).toMatch(/Repeated/);
  });
});
