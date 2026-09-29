import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/core/model.js';
import { loadProject, phaseFileNumber } from '../../src/core/load.js';
import { MULTI_PHASE, MULTI_PHASE_RUN_LOGS, RUN_LOG_LINES, RUN_LOGS, SAMPLE_PROJECT } from '../fixtures/index.js';

/** A minimal, warning-free phase file with one sprint (`N.1`) and the given dependency bullets. */
function phaseText(n: number, deps: string[] = ['None'], header = `# Phase ${n} — Test ${n}`): string {
  return [
    header,
    '',
    '---',
    '',
    `# Sprint ${n}.1 — First`,
    '',
    '### Goal',
    '',
    'Do the thing.',
    '',
    '### Tasks',
    '',
    '| Status | # | Task | Module | Reference |',
    '|--------|---|------|--------|-----------|',
    '| — | 1 | A task | src/a.ts |',
    '',
    '### Dependencies',
    '',
    ...deps.map((d) => `- ${d}`),
    '',
  ].join('\n');
}

describe('loadProject: sample-project', () => {
  it('loads one phase with no warnings, the design system, and no run logs', async () => {
    const p = await loadProject(SAMPLE_PROJECT.root);
    expect(p.root).toBe(SAMPLE_PROJECT.root);
    expect(p.phasesDir).toBe(SAMPLE_PROJECT.phasesDir);
    expect(p.phases.map((ph) => ph.number)).toEqual([1]);
    expect(p.phases[0]!.file).toBe(SAMPLE_PROJECT.phaseFiles[0]);
    expect(p.warnings).toEqual([]);
    expect(p.hasDesignSystem).toBe(true);
    expect(p.runs).toEqual([]);
    expect(p.progress.overall.percent).toBe(100);
    expect(p.progress.nextUp).toBeNull();
  });
});

describe('loadProject: multi-phase', () => {
  let p: Project;
  beforeEach(async () => {
    p = await loadProject(MULTI_PHASE.root);
  });

  it('loads three phases in order with no warnings and no design system', () => {
    expect(p.phases.map((ph) => ph.number)).toEqual([1, 2, 3]);
    expect(p.phases.map((ph) => ph.file)).toEqual(MULTI_PHASE.phaseFiles);
    expect(p.warnings).toEqual([]);
    expect(p.hasDesignSystem).toBe(false);
  });

  it('derives progress', () => {
    expect(p.progress.overall).toMatchObject({ total: 22, eligible: 19, done: 7, percent: 37 });
    expect(p.progress.nextUp?.sprint).toBe('2.1');
    expect(p.progress.blocked.map((b) => b.sprint)).toEqual(['2.1']);
    expect([p.progress.deferred, p.progress.cut]).toEqual([2, 1]);
  });

  it('reads and derives the run logs in .runs/', () => {
    expect(p.runs.map((r) => [r.phase, r.file])).toEqual([
      [1, MULTI_PHASE_RUN_LOGS.phase1],
      [2, MULTI_PHASE_RUN_LOGS.phase2],
    ]);
    const [one, two] = p.runs;
    expect(one!.events).toHaveLength(8);
    expect(one!.waves.map((w) => [w.run, w.wave, w.endedAt !== null])).toEqual([
      [1, 1, true],
      [1, 2, true],
    ]);
    expect(one!.escalations).toEqual([]);
    expect(Object.keys(one!.sprintHistory)).toEqual(['1.1', '1.2']);
    // Sprint 2.1 has a browser test (ui: /library), so after verify it waits on the wave test.
    expect(two!.waves[0]!.sprints[0]!.state).toBe('testing');
    expect(two!.waves[0]!.endedAt).toBeNull();
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('loadProject: temp folders', () => {
  let tmp: string;
  let phasesDir: string;
  let runsDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'phase-viewer-load-'));
    phasesDir = path.join(tmp, 'docs', 'phases');
    runsDir = path.join(phasesDir, '.runs');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a folder without docs/phases/ gives an empty project plus one warning', async () => {
    const p = await loadProject(tmp);
    expect(p.root).toBe(path.resolve(tmp));
    expect(p.phasesDir).toBe(path.join(path.resolve(tmp), 'docs', 'phases'));
    expect(p.phases).toEqual([]);
    expect(p.runs).toEqual([]);
    expect(p.hasDesignSystem).toBe(false);
    expect(p.progress.overall.total).toBe(0);
    expect(p.progress.nextUp).toBeNull();
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatchObject({ file: p.phasesDir, line: 0, raw: '' });
    expect(p.warnings[0]!.message).toMatch(/docs\/phases/);
  });

  it('never throws: missing root, a file as root, docs/phases as a file, bad input', async () => {
    await expect(loadProject(path.join(tmp, 'does', 'not', 'exist'))).resolves.toMatchObject({ phases: [] });
    const asFile = path.join(tmp, 'file.txt');
    writeFileSync(asFile, 'x');
    await expect(loadProject(asFile)).resolves.toMatchObject({ phases: [], runs: [] });
    mkdirSync(path.join(tmp, 'docs'));
    writeFileSync(phasesDir, 'not a folder');
    const p = await loadProject(tmp);
    expect(p.phases).toEqual([]);
    expect(p.warnings).toHaveLength(1);
    await expect(loadProject(undefined as unknown as string)).resolves.toBeDefined();
  });

  it('sorts phase files by N numerically and ignores everything else', async () => {
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(path.join(phasesDir, 'Phase-10-Ten.md'), phaseText(10));
    writeFileSync(path.join(phasesDir, 'Phase-9-Nine.md'), phaseText(9));
    writeFileSync(path.join(phasesDir, 'Phase-2-Two.md'), phaseText(2));
    writeFileSync(path.join(phasesDir, 'Phase-x-Draft.md'), phaseText(4));
    writeFileSync(path.join(phasesDir, 'Phase-5-Old.md.bak'), phaseText(5));
    writeFileSync(path.join(phasesDir, 'notes.md'), '# Notes');
    writeFileSync(path.join(runsDir, 'Phase-6-Hidden.md'), phaseText(6));
    mkdirSync(path.join(phasesDir, 'Phase-7-Folder.md'));

    const p = await loadProject(tmp);
    expect(p.phases.map((ph) => ph.number)).toEqual([2, 9, 10]);
    expect(p.phases.map((ph) => path.basename(ph.file))).toEqual(['Phase-2-Two.md', 'Phase-9-Nine.md', 'Phase-10-Ten.md']);
    expect(p.warnings).toEqual([]);
    expect(p.runs).toEqual([]);
  });

  it('warns about dependency ids that name no loaded sprint or phase', async () => {
    mkdirSync(phasesDir, { recursive: true });
    const one = path.join(phasesDir, 'Phase-1-One.md');
    const two = path.join(phasesDir, 'Phase-2-Two.md');
    writeFileSync(one, phaseText(1));
    const text = phaseText(2, ['Sprint 1.1 (exists)', 'Phase 1', 'Sprint 4.2 (not planned yet)', 'Phase 7 (someday)']);
    writeFileSync(two, text);

    const p = await loadProject(tmp);
    const lines = text.split('\n');
    const lineOf = (s: string) => lines.indexOf(s) + 1;
    expect(p.warnings).toEqual([
      {
        file: two,
        line: lineOf('- Sprint 4.2 (not planned yet)'),
        raw: '- Sprint 4.2 (not planned yet)',
        message: 'Sprint 2.1 depends on Sprint 4.2, which is not in any loaded phase',
      },
      {
        file: two,
        line: lineOf('- Phase 7 (someday)'),
        raw: '- Phase 7 (someday)',
        message: 'Sprint 2.1 depends on Phase 7, which is not loaded',
      },
    ]);
  });

  it('warns when a header disagrees with the file name, and on duplicate phase numbers', async () => {
    mkdirSync(phasesDir, { recursive: true });
    writeFileSync(path.join(phasesDir, 'Phase-1-A.md'), phaseText(1));
    writeFileSync(path.join(phasesDir, 'Phase-2-B.md'), phaseText(1, ['None'], '# Phase 1 — Copy'));
    const p = await loadProject(tmp);
    expect(p.phases.map((ph) => ph.number)).toEqual([1, 1]);
    expect(p.warnings.map((w) => [path.basename(w.file), w.line, w.raw])).toEqual([
      ['Phase-2-B.md', 1, '# Phase 1 — Copy'],
      ['Phase-2-B.md', 1, '# Phase 1 — Copy'],
    ]);
    expect(p.warnings[0]!.message).toMatch(/file name says 2/);
    expect(p.warnings[1]!.message).toMatch(/also defined in Phase-1-A\.md/);
  });

  it('collects run-log warnings with their file paths, after the phase-file warnings', async () => {
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(path.join(phasesDir, 'Phase-2-Two.md'), phaseText(2, ['Sprint 8.1']));
    const log = path.join(runsDir, 'phase-2.jsonl');
    copyFileSync(RUN_LOGS.malformedInterior, log);

    const p = await loadProject(tmp);
    expect(p.warnings.map((w) => path.basename(w.file))).toEqual(['Phase-2-Two.md', 'phase-2.jsonl']);
    expect(p.warnings[1]).toMatchObject({ file: log, line: RUN_LOG_LINES.malformedInterior });
    expect(p.runs).toHaveLength(1);
    expect(p.runs[0]!.events).toHaveLength(4);
  });

  it('derives waves from a copied run log', async () => {
    mkdirSync(runsDir, { recursive: true });
    copyFileSync(RUN_LOGS.escalation, path.join(runsDir, 'phase-2.jsonl'));
    const p = await loadProject(tmp);
    expect(p.runs[0]!.escalations).toHaveLength(1);
    expect(p.runs[0]!.sprintHistory['2.5']![0]!.state).toBe('failed');
  });

  it('warns once when a log holds events for another phase, and keeps them', async () => {
    mkdirSync(runsDir, { recursive: true });
    const log = path.join(runsDir, 'phase-4.jsonl');
    copyFileSync(RUN_LOGS.parallelWave, log);
    const p = await loadProject(tmp);
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatchObject({ file: log, line: 1 });
    expect(p.warnings[0]!.raw).toBe(readFileSync(log, 'utf8').split('\n')[0]);
    expect(p.warnings[0]!.message).toMatch(/9 event\(s\) name phase 3 in the log for phase 4/);
    expect(p.runs[0]!.phase).toBe(4);
    expect(p.runs[0]!.events).toHaveLength(9);
  });

  it('reads the design system flag from docs/design/design-system.md', async () => {
    mkdirSync(path.join(tmp, 'docs', 'design'), { recursive: true });
    writeFileSync(path.join(tmp, 'docs', 'design', 'design-system.md'), '# Design system');
    expect((await loadProject(tmp)).hasDesignSystem).toBe(true);
  });
});

describe('phaseFileNumber', () => {
  it('maps Phase-N….md names to N', () => {
    expect(phaseFileNumber('Phase-1-Groundwork.md')).toBe(1);
    expect(phaseFileNumber('Phase-10-Ten.md')).toBe(10);
    expect(phaseFileNumber('Phase-3.md')).toBe(3);
  });

  it('rejects everything else', () => {
    for (const name of ['Phase-x.md', 'Phase-1-A.md.bak', 'notes.md', 'Phase-12abc.md', 'Sprint-1.md', '.runs']) {
      expect(phaseFileNumber(name), name).toBeNull();
    }
  });
});
