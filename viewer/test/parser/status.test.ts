import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../../src/core/model.js';
import { normalizeStatus } from '../../src/core/parser/status.js';

describe('normalizeStatus', () => {
  const cases: [string, TaskStatus][] = [
    ['—', 'todo'],
    ['–', 'todo'],
    ['-', 'todo'],
    ['', 'todo'],
    ['   ', 'todo'],
    ['[ ]', 'todo'],
    ['[]', 'todo'],
    ['~', 'active'],
    ['x', 'done'],
    ['X', 'done'],
    ['[x]', 'done'],
    ['[X]', 'done'],
    [' x ', 'done'],
    ['BLOCKED', 'blocked'],
    ['blocked', 'blocked'],
    ['Blocked', 'blocked'],
    ['MANUAL', 'manual'],
    ['manual', 'manual'],
    ['Manual', 'manual'],
    [' MANUAL ', 'manual'],
    ['CUT', 'cut'],
    ['Cut', 'cut'],
    ['DEFERRED', 'deferred'],
    ['deferred', 'deferred'],
  ];

  for (const [raw, status] of cases) {
    it(`${JSON.stringify(raw)} → ${status}`, () => {
      expect(normalizeStatus(raw)).toEqual({ status, recognized: true });
    });
  }

  for (const raw of ['WIP', 'done?', 'xx', '[y]', '~~', 'constructor', 'toString', '__proto__']) {
    it(`${JSON.stringify(raw)} → unknown, unrecognized`, () => {
      expect(normalizeStatus(raw)).toEqual({ status: 'unknown', recognized: false });
    });
  }
});
