/**
 * The run log's `task` lines in the reader (`src/core/runlog/read.ts`): an
 * implementer writes one as it starts each task (`start`) and one as it
 * finishes it (`pass`), with the task number alone in `summary`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_GATES } from '../../src/core/model.js';
import { DEFAULT_MAX, readRunLog } from '../../src/core/runlog/read.js';
import { RUN_LOGS } from '../fixtures/index.js';

const FILE = '/proj/docs/phases/.runs/phase-3.jsonl';

/** A valid `task` `start` line for task 2; spread over it to change a field. */
const TASK = {
  v: 1,
  ts: '2026-09-28T10:03:10Z',
  phase: 3,
  wave: 1,
  sprint: '3.1',
  gate: 'task',
  result: 'start',
  attempt: 1,
  max: 3,
  summary: '2',
} as const;

function jsonl(...lines: Array<Record<string, unknown>>): string {
  return lines.map((l) => `${JSON.stringify(l)}\n`).join('');
}

describe('readRunLog: task lines', () => {
  it('knows the task gate', () => {
    expect(RUN_GATES).toContain('task');
    expect(DEFAULT_MAX.task).toBe(3);
  });

  it('reads a task start and a task pass line without a warning, with the task number', () => {
    const { events, warnings } = readRunLog(jsonl(TASK, { ...TASK, result: 'pass' }), FILE);
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ gate: 'task', rawGate: 'task', result: 'start', rawResult: 'start', task: 2, summary: '2', attempt: 1, max: 3, line: 1 });
    expect(events[1]).toMatchObject({ gate: 'task', result: 'pass', task: 2, line: 2 });
  });

  it('accepts spaces around the number and a missing max', () => {
    const { events, warnings } = readRunLog(jsonl({ ...TASK, summary: ' 12 ', max: undefined }), FILE);
    expect(warnings).toEqual([]);
    expect(events[0]).toMatchObject({ task: 12, max: 3 });
  });

  it('skips a task line whose summary is not a whole number, with a warning on its line', () => {
    const bad = ['', 'task 2', '2 — the settings form', '2.5', '-2', '1,2', 'two'];
    const text = jsonl(TASK, ...bad.map((summary) => ({ ...TASK, summary })), { ...TASK, summary: undefined }, { ...TASK, result: 'pass' });
    const { events, warnings } = readRunLog(text, FILE);
    // The good lines on either side are kept.
    expect(events.map((e) => e.line)).toEqual([1, bad.length + 3]);
    expect(warnings.map((w) => w.line)).toEqual(bad.map((_, i) => i + 2).concat(bad.length + 2));
    for (const w of warnings) {
      expect(w.file).toBe(FILE);
      expect(w.message).toMatch(/task number alone.*skipped$/);
    }
    expect(warnings[1]!.message).toContain('"task 2"');
  });

  it('leaves task off every other gate, whatever its summary', () => {
    const { events, warnings } = readRunLog(jsonl({ ...TASK, gate: 'verify', result: 'pass', summary: '3' }), FILE);
    expect(warnings).toEqual([]);
    expect('task' in events[0]!).toBe(false);
  });

  it('still warns about start on a gate that has none', () => {
    const { events, warnings } = readRunLog(jsonl({ ...TASK, gate: 'doc_sync', summary: '' }), FILE);
    expect(events[0]!.result).toBe('unknown');
    expect(warnings).toHaveLength(1);
  });

  it('reads the task-lines fixture with no warnings: 15 task lines among 28', () => {
    const { events, warnings } = readRunLog(readFileSync(RUN_LOGS.taskLines), RUN_LOGS.taskLines);
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(28);
    const tasks = events.filter((e) => e.gate === 'task');
    expect(tasks).toHaveLength(15);
    expect(tasks.every((e) => Number.isInteger(e.task) && (e.result === 'start' || e.result === 'pass'))).toBe(true);
    expect(events.filter((e) => e.gate !== 'task').every((e) => !('task' in e))).toBe(true);
  });
});
