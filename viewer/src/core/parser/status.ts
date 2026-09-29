/**
 * Status-cell normalization for task tables.
 *
 * Canonical cells are `—` (todo), `~` (active), `x` (done), `BLOCKED`,
 * `MANUAL`, `CUT` and `DEFERRED`. Hand edits drift, so common variants are
 * accepted too:
 *
 * | Written                                 | Status     |
 * |-----------------------------------------|------------|
 * | `—`, `–`, `-`, empty, `[ ]`             | `todo`     |
 * | `~`                                     | `active`   |
 * | `x`, `X`, `[x]`, `[X]`                  | `done`     |
 * | `blocked` / `manual` / `cut` / `deferred`, any case | same word |
 * | anything else                           | `unknown` (caller warns) |
 */
import type { TaskStatus } from '../model.js';

/** The result of normalizing one Status cell. */
export interface NormalizedStatus {
  /** The normalized status; `unknown` when the cell wasn't recognized. */
  status: TaskStatus;
  /** `false` when the cell matched nothing and the caller should warn. */
  recognized: boolean;
}

const WORDS = new Map<string, TaskStatus>([
  ['', 'todo'],
  ['—', 'todo'],
  ['–', 'todo'],
  ['-', 'todo'],
  ['~', 'active'],
  ['x', 'done'],
  ['blocked', 'blocked'],
  ['manual', 'manual'],
  ['cut', 'cut'],
  ['deferred', 'deferred'],
]);

/** Normalize a Status cell. Never throws. */
export function normalizeStatus(raw: string): NormalizedStatus {
  const cell = raw.trim().toLowerCase();
  const word = WORDS.get(cell);
  if (word) return { status: word, recognized: true };
  if (/^\[\s*\]$/.test(cell)) return { status: 'todo', recognized: true };
  if (/^\[\s*x\s*\]$/.test(cell)) return { status: 'done', recognized: true };
  return { status: 'unknown', recognized: false };
}
