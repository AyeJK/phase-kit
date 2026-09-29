/**
 * The views' derived answers (`src/client/data/status.ts`) against the
 * `trail-log` fixture: sprint status, the default phase and labels.
 */
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultPhase, phaseLabel, phaseOfSprintId, projectSprintStatus } from '../../src/client/data/status.js';
import { loadProject } from '../../src/core/load.js';
import type { Project } from '../../src/core/model.js';
import { buildScript, FIXTURES_ROOT, prepareFixture, writeStep, type PreparedFixture } from '../../scripts/simulate-run.js';

const TRAIL_LOG = path.join(FIXTURES_ROOT, 'trail-log');

let fixture: PreparedFixture | null = null;
afterEach(async () => {
  await fixture?.cleanup();
  fixture = null;
});

function statuses(project: Project, phase: number): Record<string, string> {
  const p = project.phases.find((x) => x.number === phase)!;
  return Object.fromEntries(p.sprints.map((s) => [s.id, projectSprintStatus(project, s)]));
}

/** A copy of trail-log with the first `steps` steps of a script written. */
async function played(script: 'retry' | 'escalation', steps: number): Promise<Project> {
  const fx = await prepareFixture({ freshness: 'as-is' });
  fixture = fx;
  const at = new Date('2026-09-28T15:00:00Z');
  for (const step of buildScript(script).slice(0, steps)) await writeStep(fx.root, step, at);
  return loadProject(fx.root);
}

describe('sprint status', () => {
  it('reads complete and waiting from the phase files when no wave is running', async () => {
    const project = await loadProject(TRAIL_LOG);
    expect(statuses(project, 1)).toEqual({ '1.1': 'complete', '1.2': 'complete' });
    expect(statuses(project, 2)).toEqual({ '2.1': 'complete', '2.2': 'waiting', '2.3': 'waiting', '2.4': 'waiting' });
  });

  it('marks sprints in the running wave as running', async () => {
    const project = await played('retry', 2);
    expect(statuses(project, 2)).toEqual({ '2.1': 'complete', '2.2': 'running', '2.3': 'running', '2.4': 'waiting' });
  });

  it('marks an escalated sprint as needs you', async () => {
    const script = buildScript('escalation');
    const project = await played('escalation', script.length);
    expect(statuses(project, 2)).toEqual({ '2.1': 'complete', '2.2': 'complete', '2.3': 'complete', '2.4': 'needs' });
  });
});

describe('default phase', () => {
  it('picks the phase with the most recent run activity', async () => {
    const project = await loadProject(TRAIL_LOG);
    expect(defaultPhase(project)).toBe(2);
  });

  it('falls back to the first phase with work left when there are no run logs', async () => {
    const project = await loadProject(TRAIL_LOG);
    expect(defaultPhase({ ...project, runs: [] })).toBe(2);
  });
});

describe('labels', () => {
  it('writes the phase label and reads a sprint id', () => {
    expect(phaseLabel({ number: 2, title: 'Trip Journal' })).toBe('Phase 2: Trip Journal');
    expect(phaseOfSprintId('2.4')).toBe(2);
    expect(phaseOfSprintId('x.1')).toBeNull();
  });
});
