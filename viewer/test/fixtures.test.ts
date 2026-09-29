import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUN_GATES,
  RUN_RESULTS,
  SPRINT_RUN_STATES,
  TASK_STATUSES,
  type Progress,
  type Project,
  type TaskStatus,
} from '../src/core/model.js';
import {
  BROKEN,
  BROKEN_LINES,
  FIXTURES_DIR,
  PROJECT_FIXTURES,
  RUN_LOGS,
  SAMPLE_PROJECT,
} from './fixtures/index.js';

/** Split a buffer into lines on LF only, as raw bytes. */
function byteLines(buf: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      lines.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < buf.length) lines.push(buf.subarray(start));
  return lines;
}

describe('fixture paths', () => {
  it('lives inside test/fixtures', () => {
    expect(path.basename(FIXTURES_DIR)).toBe('fixtures');
    expect(path.isAbsolute(FIXTURES_DIR)).toBe(true);
  });

  for (const [name, fx] of Object.entries(PROJECT_FIXTURES)) {
    it(`${name}: root, phases dir and every phase file exist`, () => {
      expect(path.isAbsolute(fx.root)).toBe(true);
      expect(fx.root.startsWith(FIXTURES_DIR)).toBe(true);
      expect(statSync(fx.phasesDir).isDirectory()).toBe(true);
      expect(fx.phaseFiles.length).toBeGreaterThan(0);
      for (const file of fx.phaseFiles) {
        expect(existsSync(file), file).toBe(true);
      }
    });
  }

  it('run-log fixtures exist', () => {
    for (const file of Object.values(RUN_LOGS)) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('sample-project includes its design folder', () => {
    expect(existsSync(path.join(SAMPLE_PROJECT.root, 'docs', 'design', 'design-system.md'))).toBe(true);
  });
});

describe('broken fixture', () => {
  const lines = byteLines(readFileSync(BROKEN.phaseFiles[0]!));
  const text = (n: number) => lines[n - 1]!.toString('utf8');

  it('has 91 lines', () => {
    expect(lines.length).toBe(91);
  });

  it('documented bad lines point at the right content', () => {
    expect(text(BROKEN_LINES.unclosedRow)).toMatch(/^\| — \| 2 \|.*src\/b\.ts$/);
    expect(text(BROKEN_LINES.truncatedRow)).toMatch(/^\| — \| 3 \|.*src\/c$/);
    expect(text(BROKEN_LINES.proseAfterTable)).toMatch(/^Prose straight after the table/);
    expect(text(BROKEN_LINES.malformedSprintHeader)).toBe('# Sprint one — Malformed Header');
    expect(text(BROKEN_LINES.missingGoal)).toBe('# Sprint 1.3 — Missing Goal');
    expect(text(BROKEN_LINES.recoversSprint)).toBe('# Sprint 1.4 — Recovers');
  });

  it('holds real stray bytes on the binary line', () => {
    const bin = lines[BROKEN_LINES.binaryBytes - 1]!;
    expect(bin.includes(0x00)).toBe(true);
    expect(bin.includes(0xff)).toBe(true);
    expect(bin.includes(0xfe)).toBe(true);
  });

  it('uses LF line endings only', () => {
    const buf = readFileSync(BROKEN.phaseFiles[0]!);
    expect(buf.includes(0x0d)).toBe(false);
  });
});

describe('model', () => {
  it('exports every enumeration', () => {
    expect(TASK_STATUSES).toEqual(['todo', 'active', 'done', 'blocked', 'manual', 'cut', 'deferred', 'unknown']);
    expect(RUN_GATES).toContain('wave_test');
    expect(RUN_RESULTS).toContain('partial');
    expect(SPRINT_RUN_STATES).toEqual(['implementing', 'verifying', 'testing', 'syncing', 'done', 'failed']);
  });

  it('types compose into a JSON-serializable Project', () => {
    const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    const empty: Progress = { total: 0, eligible: 0, done: 0, percent: 0, byStatus };
    const project: Project = {
      root: SAMPLE_PROJECT.root,
      phasesDir: SAMPLE_PROJECT.phasesDir,
      phases: [
        {
          number: 1,
          title: 'Notifications',
          intro: '',
          file: SAMPLE_PROJECT.phaseFiles[0]!,
          line: 1,
          trailingSections: [{ heading: 'Scope Guard', level: 2, body: 'No push.', line: 70 }],
          sprints: [
            {
              id: '1.1',
              phase: 1,
              number: 1,
              title: 'Notification Schema and Queue',
              goal: 'Add the notification data model.',
              legacyTable: false,
              tasks: [
                {
                  number: 1,
                  text: 'Add `notifications` table',
                  status: 'done',
                  rawStatus: 'x',
                  legacy: false,
                  module: 'db/migrations/',
                  reference: null,
                  line: 17,
                },
              ],
              acceptanceCriteria: [{ text: 'Rows are sent', checked: null, line: 24 }],
              dependencies: [{ raw: 'None', sprints: [], phases: [], none: true, line: 29 }],
              verification: { cli: 'npm run check', ui: [], skills: [], viewports: [], skipUi: true, assert: [], extra: {}, line: 31 },
              sections: [],
              line: 7,
              endLine: 36,
            },
          ],
        },
      ],
      runs: [],
      hasDesignSystem: true,
      progress: {
        overall: empty,
        byPhase: { '1': empty },
        bySprint: { '1.1': empty },
        nextUp: null,
        blocked: [],
        deferred: 0,
        cut: 0,
      },
      warnings: [{ file: SAMPLE_PROJECT.phaseFiles[0]!, line: 3, raw: 'x', message: 'example' }],
    };
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);
  });
});
