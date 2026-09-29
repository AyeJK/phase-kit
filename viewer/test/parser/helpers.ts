import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { Phase, Task, Warning } from '../../src/core/model.js';
import { parsePhaseFile } from '../../src/core/parser/phase.js';

/** A fixture file parsed, plus its text split into lines for checking warnings. */
export interface ParsedFixture {
  text: string;
  /** The file's lines (index 0 is line 1), without line endings. */
  lines: string[];
  phase: Phase;
  warnings: Warning[];
}

/** Read a phase fixture as UTF-8 and parse it. */
export function parseFixture(file: string): ParsedFixture {
  const text = readFileSync(file, 'utf8');
  const { phase, warnings } = parsePhaseFile(text, file);
  return { text, lines: text.split(/\r?\n/), phase, warnings };
}

/** Every task in a phase, in file order. */
export function allTasks(phase: Phase): Task[] {
  return phase.sprints.flatMap((s) => s.tasks);
}

/** The keys every Task has, sorted. */
export const TASK_KEYS = ['legacy', 'line', 'module', 'number', 'rawStatus', 'reference', 'status', 'text'];

/** Assert-friendly description of a task's shape: sorted keys plus the type of each value. */
export function taskShape(task: Task): Record<string, string> {
  return Object.fromEntries(
    Object.keys(task)
      .sort()
      .map((k) => {
        const v = (task as unknown as Record<string, unknown>)[k];
        return [k, v === null ? 'null' : typeof v];
      }),
  );
}

/** Check that every warning points at a real line and quotes it exactly. */
export function expectWarningsQuoteTheirLines(fx: ParsedFixture, file: string): void {
  for (const w of fx.warnings) {
    expect(w.file).toBe(file);
    expect(Number.isInteger(w.line)).toBe(true);
    expect(w.line).toBeGreaterThanOrEqual(0);
    expect(w.line).toBeLessThanOrEqual(fx.lines.length);
    expect(w.raw, `raw text of the warning on line ${w.line}`).toBe(w.line === 0 ? '' : fx.lines[w.line - 1]);
    expect(w.message.length).toBeGreaterThan(0);
  }
}
