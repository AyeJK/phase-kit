import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/core/model.js';
import { DEFAULT_MAX, readRunLog, type RunLogRead } from '../../src/core/runlog/read.js';
import { RUN_LOG_LINES, RUN_LOGS } from '../fixtures/index.js';

/** Read a fixture as UTF-8 text, the way the server will. */
function readFixture(file: string): RunLogRead {
  return readRunLog(readFileSync(file, 'utf8'), file);
}

/** `[sprint, gate, result, attempt]` per event, for compact sequence checks. */
function steps(events: RunEvent[]): Array<[string, string, string, number]> {
  return events.map((e) => [e.sprint, e.gate, e.result, e.attempt]);
}

const FILE = '/proj/docs/phases/.runs/phase-2.jsonl';

/** A valid v1 event; spread over it and set a key to `undefined` to drop it. */
const BASE = {
  v: 1,
  ts: '2026-09-28T10:00:00Z',
  phase: 2,
  wave: 1,
  sprint: '2.3',
  gate: 'verify',
  result: 'pass',
  attempt: 1,
  max: 3,
  summary: 'criteria 1/1 met',
} as const;

/** Build a complete (every line LF-terminated) log from objects and raw strings. */
function jsonl(...lines: Array<Record<string, unknown> | string>): string {
  return lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l)) + '\n').join('');
}

const EVENT_KEYS = [
  'attempt',
  'gate',
  'line',
  'max',
  'phase',
  'rawGate',
  'rawResult',
  'result',
  'sprint',
  'summary',
  'ts',
  'v',
  'wave',
];

// ---------------------------------------------------------------------------
// One suite per fixture
// ---------------------------------------------------------------------------

describe('fixture: realSmoke (real log, fail → retry → pass)', () => {
  const { events, warnings } = readFixture(RUN_LOGS.realSmoke);

  it('reads all 5 events with no warnings', () => {
    expect(warnings).toEqual([]);
    expect(events.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the verify fail → retry → pass sequence', () => {
    expect(steps(events)).toEqual([
      ['2.1', 'implement', 'pass', 1],
      ['2.1', 'verify', 'fail', 1],
      ['2.1', 'implement', 'pass', 2],
      ['2.1', 'verify', 'pass', 2],
      ['2.1', 'doc_sync', 'pass', 1],
    ]);
    expect(events.every((e) => e.phase === 2 && e.wave === 1 && e.v === 1)).toBe(true);
  });

  it('keeps doc_sync files and leaves them off other gates', () => {
    expect(events[4]!.files).toEqual(['src/slugify.js', 'test/slugify.test.js']);
    expect(events.slice(0, 4).every((e) => !('files' in e))).toBe(true);
  });

  it('keeps summaries exactly as logged, non-ASCII included', () => {
    expect(events[3]!.summary).toBe('criteria 2/2 met');
    expect(events[0]!.summary).toContain('—');
  });
});

describe('fixture: realPhase1 (real Phase 1 log)', () => {
  const { events, warnings } = readFixture(RUN_LOGS.realPhase1);

  it('reads 3 events, verify partial, doc_sync with 5 files', () => {
    expect(warnings).toEqual([]);
    expect(steps(events)).toEqual([
      ['1.4', 'implement', 'pass', 1],
      ['1.4', 'verify', 'partial', 1],
      ['1.4', 'doc_sync', 'pass', 1],
    ]);
    expect(events[2]!.files).toHaveLength(5);
    expect(events[2]!.max).toBe(1);
  });
});

describe('fixture: failRetryPass', () => {
  const { events, warnings } = readFixture(RUN_LOGS.failRetryPass);

  it('reads verify #1 fail, implement #2, verify #2 pass, doc_sync pass', () => {
    expect(warnings).toEqual([]);
    expect(steps(events)).toEqual([
      ['2.4', 'implement', 'pass', 1],
      ['2.4', 'verify', 'fail', 1],
      ['2.4', 'implement', 'pass', 2],
      ['2.4', 'verify', 'pass', 2],
      ['2.4', 'doc_sync', 'pass', 1],
    ]);
    expect(events.map((e) => e.max)).toEqual([3, 3, 3, 3, 1]);
    expect(events.every((e) => e.phase === 2 && e.wave === 3)).toBe(true);
  });

  it('keeps summary and files', () => {
    expect(events[1]!.summary).toBe('typecheck: 2 errors in src/parser.ts');
    expect(events[4]!.files).toEqual(['src/parser/tables.ts', 'src/parser/tables.test.ts']);
  });
});

describe('fixture: parallelWave', () => {
  const { events, warnings } = readFixture(RUN_LOGS.parallelWave);

  it('reads both sprints of wave 1 interleaved, then wave 2', () => {
    expect(warnings).toEqual([]);
    expect(events.map((e) => [e.wave, e.sprint, e.gate])).toEqual([
      [1, '3.1', 'implement'],
      [1, '3.2', 'implement'],
      [1, '3.1', 'verify'],
      [1, '3.2', 'verify'],
      [1, '3.1', 'doc_sync'],
      [1, '3.2', 'doc_sync'],
      [2, '3.3', 'implement'],
      [2, '3.3', 'verify'],
      [2, '3.3', 'doc_sync'],
    ]);
  });

  it('keeps blocked and partial results', () => {
    expect(events[1]!.result).toBe('blocked');
    expect(events[3]!.result).toBe('partial');
  });

  it('keeps file order even when ts goes backwards', () => {
    expect(events[3]!.ts < events[2]!.ts).toBe(true);
    expect(events.map((e) => e.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('gives both sprints the same doc_sync files', () => {
    expect(events[4]!.files).toEqual(events[5]!.files);
    expect(events[4]!.files).toHaveLength(3);
  });
});

describe('fixture: escalation', () => {
  const { events, warnings } = readFixture(RUN_LOGS.escalation);

  it('reads verify fails at attempts 1, 2 and 3 of max 3, ending on the last fail', () => {
    expect(warnings).toEqual([]);
    const verifies = events.filter((e) => e.gate === 'verify');
    expect(verifies.map((e) => [e.result, e.attempt, e.max])).toEqual([
      ['fail', 1, 3],
      ['fail', 2, 3],
      ['fail', 3, 3],
    ]);
    const last = events.at(-1)!;
    expect([last.gate, last.result, last.attempt === last.max]).toEqual(['verify', 'fail', true]);
    expect(events).toHaveLength(6);
  });
});

describe('fixture: waveTestRetry', () => {
  const { events, warnings } = readFixture(RUN_LOGS.waveTestRetry);

  it('reads wave_test fail then pass, with the verify re-run keeping attempt 1', () => {
    expect(warnings).toEqual([]);
    expect(steps(events)).toEqual([
      ['4.2', 'implement', 'pass', 1],
      ['4.2', 'verify', 'pass', 1],
      ['4.2', 'wave_test', 'fail', 1],
      ['4.2', 'implement', 'pass', 1],
      ['4.2', 'verify', 'pass', 1],
      ['4.2', 'wave_test', 'pass', 2],
      ['4.2', 'doc_sync', 'pass', 1],
    ]);
  });
});

describe('fixture: stoppedRun', () => {
  const { events, warnings } = readFixture(RUN_LOGS.stoppedRun);

  it('reads one fail below max with nothing after it', () => {
    expect(warnings).toEqual([]);
    expect(steps(events)).toEqual([
      ['5.1', 'implement', 'pass', 1],
      ['5.1', 'verify', 'fail', 1],
    ]);
    expect(events[1]!.max).toBe(3);
  });
});

describe('fixture: truncatedLastLine', () => {
  const text = readFileSync(RUN_LOGS.truncatedLastLine, 'utf8');
  const { events, warnings } = readRunLog(text, RUN_LOGS.truncatedLastLine);

  it('really ends mid-line, without a newline', () => {
    expect(text.endsWith('\n')).toBe(false);
    expect(text.split('\n')).toHaveLength(3);
  });

  it('returns every complete event and raises no warning', () => {
    expect(warnings).toEqual([]);
    expect(steps(events)).toEqual([
      ['2.2', 'implement', 'pass', 1],
      ['2.2', 'verify', 'pass', 1],
    ]);
  });
});

describe('fixture: malformedInterior', () => {
  const text = readFileSync(RUN_LOGS.malformedInterior, 'utf8');
  const { events, warnings } = readRunLog(text, RUN_LOGS.malformedInterior);
  const bad = RUN_LOG_LINES.malformedInterior;

  it('returns the events on both sides of the bad line', () => {
    expect(events.map((e) => e.line)).toEqual([1, 2, 4, 5]);
    expect(steps(events)).toEqual([
      ['2.1', 'implement', 'pass', 1],
      ['2.1', 'verify', 'fail', 1],
      ['2.1', 'verify', 'pass', 2],
      ['2.1', 'doc_sync', 'pass', 1],
    ]);
  });

  it('raises exactly one warning, on the right line, with the raw text', () => {
    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.line).toBe(bad);
    expect(w.file).toBe(RUN_LOGS.malformedInterior);
    expect(w.raw).toBe(text.split('\n')[bad - 1]);
    expect(w.message).toMatch(/not valid JSON/);
  });
});

describe('fixture: unknownValues', () => {
  const { events, warnings } = readFixture(RUN_LOGS.unknownValues);

  it('keeps every line as an event', () => {
    expect(events.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('warns once for v 2, once per unknown gate and result, in file order', () => {
    expect(warnings.map((w) => w.line)).toEqual([
      RUN_LOG_LINES.unknownVersion,
      RUN_LOG_LINES.unknownGate,
      RUN_LOG_LINES.unknownResult,
    ]);
    expect(warnings[0]!.message).toMatch(/v2.*best-effort/);
    expect(warnings[1]!.message).toMatch(/gate "review"/);
    expect(warnings[2]!.message).toMatch(/result "skipped"/);
  });

  it('reads v 2 lines best-effort, keeping the logged version', () => {
    expect(events.map((e) => e.v)).toEqual([1, 2, 2, 1, 1]);
    expect(events[1]!.gate).toBe('verify');
  });

  it('keeps unknown gate and result as unknown with the raw value', () => {
    const g = events[RUN_LOG_LINES.unknownGate - 1]!;
    expect([g.gate, g.rawGate, g.result]).toEqual(['unknown', 'review', 'pass']);
    const r = events[RUN_LOG_LINES.unknownResult - 1]!;
    expect([r.gate, r.result, r.rawResult]).toEqual(['wave_test', 'unknown', 'skipped']);
  });

  it('ignores extra fields', () => {
    expect(Object.keys(events[0]!).sort()).toEqual(EVENT_KEYS);
    expect(Object.keys(events[1]!).sort()).toEqual(EVENT_KEYS);
  });

  it('defaults a missing summary to empty and a missing doc_sync max to 1', () => {
    const e = events[RUN_LOG_LINES.missingOptional - 1]!;
    expect(e.summary).toBe('');
    expect(e.max).toBe(1);
  });
});

describe('fixture: binaryGarbage', () => {
  const buf = readFileSync(RUN_LOGS.binaryGarbage);

  it('holds real stray bytes', () => {
    expect(buf.includes(0x00)).toBe(true);
    expect(buf.includes(0xff)).toBe(true);
    expect(buf.at(-1)).not.toBe(0x0a);
  });

  it('returns the one valid event and warns on each terminated garbage line', () => {
    const { events, warnings } = readRunLog(buf, RUN_LOGS.binaryGarbage);
    expect(events).toHaveLength(1);
    expect(events[0]!.line).toBe(RUN_LOG_LINES.binaryValidEvent);
    expect(events[0]!.sprint).toBe('7.1');
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 4, 5]);
    expect(warnings.every((w) => /not valid JSON/.test(w.message))).toBe(true);
  });

  it('reads the same events when the caller decodes to text first', () => {
    const fromText = readRunLog(buf.toString('utf8'), RUN_LOGS.binaryGarbage);
    expect(fromText.events).toEqual(readRunLog(buf, RUN_LOGS.binaryGarbage).events);
    expect(fromText.warnings.map((w) => w.line)).toEqual([1, 2, 4, 5]);
  });
});

describe('every run-log fixture', () => {
  for (const [name, file] of Object.entries(RUN_LOGS)) {
    it(`${name}: never throws, keeps line order, serializes as plain JSON`, () => {
      const result = readRunLog(readFileSync(file), file);
      const lines = result.events.map((e) => e.line);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
      expect(new Set(lines).size).toBe(lines.length);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      for (const w of result.warnings) expect(w.file).toBe(file);
    });
  }
});

// ---------------------------------------------------------------------------
// Tolerance rules
// ---------------------------------------------------------------------------

describe('readRunLog: in-progress last line', () => {
  it('returns nothing for an empty file, as text or bytes', () => {
    expect(readRunLog('', FILE)).toEqual({ events: [], warnings: [] });
    expect(readRunLog(new Uint8Array(0), FILE)).toEqual({ events: [], warnings: [] });
  });

  it('skips a complete final line that has no trailing newline, silently', () => {
    const text = jsonl(BASE) + JSON.stringify({ ...BASE, gate: 'doc_sync', max: 1 });
    const { events, warnings } = readRunLog(text, FILE);
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]!.gate).toBe('verify');
  });

  it('skips a file that is one unterminated line', () => {
    expect(readRunLog(JSON.stringify(BASE), FILE)).toEqual({ events: [], warnings: [] });
  });

  it('skips garbage in the unterminated tail without warning', () => {
    expect(readRunLog(jsonl(BASE) + '{{{ not json', FILE).warnings).toEqual([]);
  });
});

describe('readRunLog: line handling', () => {
  it('skips blank lines silently and keeps true line numbers', () => {
    const text = jsonl(BASE, '', '   ', { ...BASE, attempt: 2 });
    const { events, warnings } = readRunLog(text, FILE);
    expect(warnings).toEqual([]);
    expect(events.map((e) => e.line)).toEqual([1, 4]);
  });

  it('accepts CRLF endings and reports raw lines without the CR', () => {
    const text = JSON.stringify(BASE) + '\r\n' + 'oops\r\n' + JSON.stringify(BASE) + '\r\n';
    const { events, warnings } = readRunLog(text, FILE);
    expect(events.map((e) => e.line)).toEqual([1, 3]);
    expect(warnings).toEqual([{ file: FILE, line: 2, raw: 'oops', message: expect.any(String) }]);
  });

  it('ignores a leading UTF-8 BOM, in text and bytes', () => {
    const text = '﻿' + jsonl(BASE);
    expect(readRunLog(text, FILE).events).toHaveLength(1);
    expect(readRunLog(Buffer.from(text, 'utf8'), FILE).events).toHaveLength(1);
  });

  it('keeps file order and never sorts by ts', () => {
    const text = jsonl(
      { ...BASE, ts: '2026-09-28T12:00:00Z', sprint: '2.1' },
      { ...BASE, ts: '2026-09-28T09:00:00Z', sprint: '2.2' },
      { ...BASE, ts: '2026-09-27T23:59:59Z', sprint: '2.3' },
    );
    expect(readRunLog(text, FILE).events.map((e) => e.sprint)).toEqual(['2.1', '2.2', '2.3']);
  });

  it('warns on JSON that is not an object', () => {
    const text = jsonl('[1,2]', 'null', '42', '"verify"', BASE);
    const { events, warnings } = readRunLog(text, FILE);
    expect(events.map((e) => e.line)).toEqual([5]);
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 3, 4]);
    expect(warnings.every((w) => /not a JSON object/.test(w.message))).toBe(true);
  });
});

describe('readRunLog: required fields', () => {
  for (const key of ['v', 'ts', 'phase', 'wave', 'sprint', 'gate', 'result', 'attempt'] as const) {
    it(`skips a line without "${key}", with a warning on its line`, () => {
      const text = jsonl(BASE, { ...BASE, [key]: undefined }, BASE);
      const { events, warnings } = readRunLog(text, FILE);
      expect(events.map((e) => e.line)).toEqual([1, 3]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.line).toBe(2);
      expect(warnings[0]!.message).toContain(`"${key}"`);
    });
  }

  const wrong: Array<[string, Record<string, unknown>]> = [
    ['attempt as a string', { attempt: '1' }],
    ['a fractional phase', { phase: 1.5 }],
    ['a negative wave', { wave: -1 }],
    ['sprint as a number', { sprint: 2.3 }],
    ['an empty ts', { ts: '' }],
    ['gate as null', { gate: null }],
    ['result as an object', { result: { ok: true } }],
  ];
  for (const [label, patch] of wrong) {
    it(`skips a line with ${label}`, () => {
      const { events, warnings } = readRunLog(jsonl({ ...BASE, ...patch }), FILE);
      expect(events).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.line).toBe(1);
    });
  }

  it('lists every problem of a line in one warning', () => {
    const { warnings } = readRunLog(jsonl({ v: 1, phase: 'two' }), FILE);
    expect(warnings).toHaveLength(1);
    for (const key of ['ts', 'phase', 'wave', 'sprint', 'gate', 'result', 'attempt']) {
      expect(warnings[0]!.message).toContain(`"${key}"`);
    }
  });

  it('accepts 0 for phase, wave and attempt (the writer logs 0 for an empty value)', () => {
    const { events } = readRunLog(jsonl({ ...BASE, phase: 0, wave: 0, attempt: 0 }), FILE);
    expect(events).toHaveLength(1);
  });
});

describe('readRunLog: version', () => {
  it('skips v below 1, non-numeric v, and warns for each', () => {
    const text = jsonl({ ...BASE, v: 0 }, { ...BASE, v: '1' }, { ...BASE, v: null }, BASE);
    const { events, warnings } = readRunLog(text, FILE);
    expect(events.map((e) => e.line)).toEqual([4]);
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 3]);
    expect(warnings.every((w) => !/best-effort/.test(w.message))).toBe(true);
  });

  it('warns once per file however many newer versions appear', () => {
    const text = jsonl(BASE, { ...BASE, v: 2 }, { ...BASE, v: 3 }, { ...BASE, v: 2 });
    const { events, warnings } = readRunLog(text, FILE);
    expect(events.map((e) => e.v)).toEqual([1, 2, 3, 2]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.line).toBe(2);
  });

  it('warns again for a different file', () => {
    const text = jsonl({ ...BASE, v: 2 });
    expect(readRunLog(text, 'a.jsonl').warnings).toHaveLength(1);
    expect(readRunLog(text, 'b.jsonl').warnings).toHaveLength(1);
  });

  it('still validates required fields on a newer-version line', () => {
    const { events, warnings } = readRunLog(jsonl({ ...BASE, v: 2, ts: undefined }), FILE);
    expect(events).toEqual([]);
    expect(warnings.map((w) => w.line)).toEqual([1, 1]);
  });
});

describe('readRunLog: optional fields', () => {
  it('fills the spec default max per gate when max is missing', () => {
    const gates = ['implement', 'verify', 'wave_test', 'doc_sync', 'mystery'];
    const text = jsonl(...gates.map((gate) => ({ ...BASE, gate, max: undefined })));
    const { events } = readRunLog(text, FILE);
    expect(events.map((e) => e.max)).toEqual([3, 3, 3, 1, 3]);
    expect(events.map((e) => e.max)).toEqual(events.map((e) => DEFAULT_MAX[e.gate]));
  });

  it('keeps max 0 (no limit)', () => {
    expect(readRunLog(jsonl({ ...BASE, max: 0 }), FILE).events[0]!.max).toBe(0);
  });

  it('warns on an invalid max and uses the default', () => {
    const { events, warnings } = readRunLog(jsonl({ ...BASE, max: '5' }), FILE);
    expect(events[0]!.max).toBe(3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toMatch(/"max"/);
  });

  it('treats a missing summary as empty without warning, a non-string one with a warning', () => {
    const missing = readRunLog(jsonl({ ...BASE, summary: undefined }), FILE);
    expect(missing.events[0]!.summary).toBe('');
    expect(missing.warnings).toEqual([]);
    const numeric = readRunLog(jsonl({ ...BASE, summary: 42 }), FILE);
    expect(numeric.events[0]!.summary).toBe('');
    expect(numeric.warnings).toHaveLength(1);
  });

  it('keeps files, dropping non-string entries with a warning', () => {
    const { events, warnings } = readRunLog(jsonl({ ...BASE, files: ['a.ts', 3, null, 'b.ts'] }), FILE);
    expect(events[0]!.files).toEqual(['a.ts', 'b.ts']);
    expect(warnings).toHaveLength(1);
  });

  it('keeps an empty files array (an empty diff)', () => {
    const { events, warnings } = readRunLog(jsonl({ ...BASE, gate: 'doc_sync', files: [] }), FILE);
    expect(events[0]!.files).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('ignores a files value that is not an array, with a warning', () => {
    const { events, warnings } = readRunLog(jsonl({ ...BASE, files: 'a.ts' }), FILE);
    expect(events).toHaveLength(1);
    expect('files' in events[0]!).toBe(false);
    expect(warnings).toHaveLength(1);
  });
});

describe('readRunLog: never throws', () => {
  /** Deterministic pseudo-random bytes (LCG), with some newlines mixed in. */
  function garbage(size: number, seed: number): Buffer {
    const buf = Buffer.alloc(size);
    let x = seed;
    for (let i = 0; i < size; i++) {
      x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
      buf[i] = x % 17 === 0 ? 0x0a : x & 0xff;
    }
    return buf;
  }

  it('survives binary garbage and returns only warnings', () => {
    for (const seed of [1, 7, 42]) {
      const buf = garbage(8192, seed);
      const result = readRunLog(buf, FILE);
      expect(result.events).toEqual([]);
      expect(result.warnings.every((w) => w.file === FILE && w.line >= 1)).toBe(true);
    }
  });

  it('survives deeply nested JSON and a very long line', () => {
    const deep = '['.repeat(200_000) + ']'.repeat(200_000);
    const long = JSON.stringify({ ...BASE, summary: 'x'.repeat(1_000_000) });
    const { events, warnings } = readRunLog(jsonl(deep, long), FILE);
    expect(events.map((e) => e.line)).toEqual([2]);
    expect(warnings.map((w) => w.line)).toEqual([1]);
  });

  it('survives input that is not text at all', () => {
    for (const bad of [undefined, null, 42, {}]) {
      expect(readRunLog(bad as unknown as string, FILE)).toEqual({ events: [], warnings: [] });
    }
  });

  it('survives JSON with prototype-shaped keys', () => {
    const text = jsonl('{"__proto__":{"v":1},"constructor":1}', { ...BASE, toString: 'x' });
    const { events, warnings } = readRunLog(text, FILE);
    expect(events.map((e) => e.line)).toEqual([2]);
    expect(warnings.map((w) => w.line)).toEqual([1]);
  });
});
