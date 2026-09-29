import { readFileSync } from 'node:fs';
import type { RunEvent, RunGate, RunResult } from '../../src/core/model.js';
import { DEFAULT_MAX, readRunLog } from '../../src/core/runlog/read.js';

/** Read a run-log fixture's events (UTF-8, as the server will). */
export function fixtureEvents(file: string): RunEvent[] {
  return readRunLog(readFileSync(file, 'utf8'), file).events;
}

/** Shorthand for one synthetic event: `[wave, sprint, gate, result, attempt, max?]`. */
export type EventSpec = [number, string, RunGate, RunResult, number, number?];

/**
 * Build synthetic events in line order (line = index + 1, one second apart).
 * `phase` comes from the sprint id.
 */
export function events(...specs: EventSpec[]): RunEvent[] {
  return specs.map(([wave, sprint, gate, result, attempt, max], i) => {
    const ts = new Date(Date.UTC(2026, 8, 28, 10, 0, i)).toISOString().replace('.000Z', 'Z');
    return {
      v: 1,
      ts,
      phase: Number(sprint.split('.')[0]),
      wave,
      sprint,
      gate,
      rawGate: gate,
      result,
      rawResult: result,
      attempt,
      max: max ?? DEFAULT_MAX[gate],
      summary: `${gate} ${result} #${attempt}`,
      line: i + 1,
    };
  });
}

/** `[gate, result, attempt]` per step, for compact sequence checks. */
export function seq(items: Array<{ gate: RunGate; result: RunResult; attempt: number }>): Array<[string, string, number]> {
  return items.map((s) => [s.gate, s.result, s.attempt]);
}
