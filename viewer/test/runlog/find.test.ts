import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findRunLogs,
  findRunLogsSync,
  runLogPhase,
  RUNS_DIR_NAME,
  type RunLogFile,
} from '../../src/core/runlog/find.js';
import { readRunLog } from '../../src/core/runlog/read.js';
import { RUN_LOGS } from '../fixtures/index.js';

describe('runLogPhase', () => {
  it('maps phase-N.jsonl to N', () => {
    expect(runLogPhase('phase-1.jsonl')).toBe(1);
    expect(runLogPhase('phase-12.jsonl')).toBe(12);
    expect(runLogPhase('phase-0.jsonl')).toBe(0);
  });

  it('rejects every other name', () => {
    for (const name of [
      'phase-01.jsonl',
      'Phase-4.jsonl',
      'phase-x.jsonl',
      'phase-.jsonl',
      'phase-3.json',
      'phase-5.jsonl.bak',
      '.phase-7.jsonl',
      'phase-9',
      'phase-1-2.jsonl',
      'notes.txt',
      'phase-99999999999999999999.jsonl',
    ]) {
      expect(runLogPhase(name), name).toBeNull();
    }
  });
});

const variants: Array<[string, (phasesDir: string) => Promise<RunLogFile[]>]> = [
  ['findRunLogs', findRunLogs],
  ['findRunLogsSync', async (dir) => findRunLogsSync(dir)],
];

describe.each(variants)('%s', (_name, find) => {
  let tmp: string;
  let phasesDir: string;
  let runsDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'phase-viewer-runlogs-'));
    phasesDir = path.join(tmp, 'docs', 'phases');
    runsDir = path.join(phasesDir, RUNS_DIR_NAME);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns [] when .runs/ is missing', async () => {
    mkdirSync(phasesDir, { recursive: true });
    await expect(find(phasesDir)).resolves.toEqual([]);
  });

  it('returns [] when the phases folder itself is missing', async () => {
    await expect(find(path.join(tmp, 'nope', 'docs', 'phases'))).resolves.toEqual([]);
  });

  it('returns [] when .runs is a file, or the phases path is a file', async () => {
    mkdirSync(phasesDir, { recursive: true });
    writeFileSync(runsDir, 'not a folder');
    await expect(find(phasesDir)).resolves.toEqual([]);
    const asFile = path.join(tmp, 'file.txt');
    writeFileSync(asFile, '');
    await expect(find(asFile)).resolves.toEqual([]);
  });

  it('returns [] for an empty .runs/', async () => {
    mkdirSync(runsDir, { recursive: true });
    await expect(find(phasesDir)).resolves.toEqual([]);
  });

  it('lists phase-N.jsonl files sorted by phase and ignores everything else', async () => {
    mkdirSync(runsDir, { recursive: true });
    for (const name of [
      'phase-12.jsonl',
      'phase-2.jsonl',
      'phase-1.jsonl',
      'phase-01.jsonl',
      'Phase-4.jsonl',
      'phase-x.jsonl',
      'phase-3.json',
      'phase-5.jsonl.bak',
      '.phase-7.jsonl',
      'notes.txt',
    ]) {
      writeFileSync(path.join(runsDir, name), '');
    }
    mkdirSync(path.join(runsDir, 'phase-8.jsonl')); // a folder with a log's name
    mkdirSync(path.join(runsDir, 'old'));
    writeFileSync(path.join(runsDir, 'old', 'phase-10.jsonl'), ''); // not recursive
    writeFileSync(path.join(phasesDir, 'phase-11.jsonl'), ''); // outside .runs/
    writeFileSync(path.join(phasesDir, 'Phase-1-Groundwork.md'), '# Phase 1');

    const found = await find(phasesDir);
    expect(found.map((f) => f.phase)).toEqual([1, 2, 12]);
    expect(found.map((f) => f.file)).toEqual([
      path.join(runsDir, 'phase-1.jsonl'),
      path.join(runsDir, 'phase-2.jsonl'),
      path.join(runsDir, 'phase-12.jsonl'),
    ]);
  });

  it('returns each file mtime', async () => {
    mkdirSync(runsDir, { recursive: true });
    const older = path.join(runsDir, 'phase-1.jsonl');
    const newer = path.join(runsDir, 'phase-2.jsonl');
    writeFileSync(older, '');
    writeFileSync(newer, '');
    utimesSync(older, 1_700_000_000, 1_700_000_000);
    utimesSync(newer, 1_800_000_000, 1_800_000_000);

    const found = await find(phasesDir);
    expect(found.map((f) => Math.round(f.mtimeMs / 1000))).toEqual([1_700_000_000, 1_800_000_000]);
    expect(found[0]!.mtimeMs).toBe(statSync(older).mtimeMs);
    expect(JSON.parse(JSON.stringify(found))).toEqual(found);
  });

  it('finds logs that readRunLog can then read', async () => {
    mkdirSync(runsDir, { recursive: true });
    copyFileSync(RUN_LOGS.failRetryPass, path.join(runsDir, 'phase-2.jsonl'));
    const [log] = await find(phasesDir);
    expect(log?.phase).toBe(2);
    const { events, warnings } = readRunLog(readFileSync(log!.file, 'utf8'), log!.file);
    expect(warnings).toEqual([]);
    expect(events.every((e) => e.phase === log!.phase)).toBe(true);
    expect(events).toHaveLength(5);
  });
});
