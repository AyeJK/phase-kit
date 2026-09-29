/**
 * The client's update folding (`src/client/data/applyUpdate.ts`) against the
 * server's own state: a snapshot plus every update the server emits must
 * equal the server's next snapshot. Runs on temp copies of the `trail-log`
 * fixture, driving `ProjectState.apply` directly (no watcher, no HTTP).
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyUpdate, baseName, parseSnapshot, parseUpdate, UPDATE_EVENTS } from '../../src/client/data/applyUpdate.js';
import { createProjectState, type ProjectState, type StateUpdate } from '../../src/server/state.js';
import type { ViewerSnapshot } from '../../src/shared/protocol.js';
import { buildScript, prepareFixture, writeStep, type PreparedFixture } from '../../scripts/simulate-run.js';

/** What the browser would receive: the value after a JSON round trip. */
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let fixture: PreparedFixture | null = null;
afterEach(async () => {
  await fixture?.cleanup();
  fixture = null;
});

async function setup(): Promise<{ fx: PreparedFixture; state: ProjectState; client: ViewerSnapshot }> {
  const fx = await prepareFixture({ freshness: 'as-is' });
  fixture = fx;
  const state = await createProjectState(fx.root);
  const client = wire<ViewerSnapshot>({ workspace: { kind: 'found', root: fx.root, source: 'dir' }, project: state.snapshot() });
  return { fx, state, client };
}

function fold(snapshot: ViewerSnapshot, updates: readonly StateUpdate[]): ViewerSnapshot {
  return updates.reduce((acc, u) => applyUpdate(acc, wire(u)), snapshot);
}

describe('applyUpdate', () => {
  it('folds run and phase updates into the same model the server holds', async () => {
    const setupResult = await setup();
    const { fx, state: live } = setupResult;
    let client = setupResult.client;

    const runLog = path.join(fx.runsDir, 'phase-2.jsonl');
    const phaseFile = path.join(fx.phasesDir, 'Phase-2-Trip-Journal.md');
    let at = Date.parse('2026-09-28T14:00:00Z');
    let sawPhaseUpdate = false;
    for (const step of buildScript('escalation')) {
      at += 60_000;
      await writeStep(fx.root, step, new Date(at));
      const updates: StateUpdate[] = [];
      if (step.markDone) updates.push(...(await live.apply({ kind: 'phase', file: phaseFile })));
      updates.push(...(await live.apply({ kind: 'run', file: runLog })));
      if (updates.some((u) => u.type === 'phase')) sawPhaseUpdate = true;
      client = fold(client, updates);
      expect(client.project).toEqual(wire(live.snapshot()));
    }
    expect(sawPhaseUpdate).toBe(true);

    const phase2 = client.project!.runs.find((r) => r.phase === 2)!;
    expect(phase2.escalations.map((e) => e.sprint)).toEqual(['2.4']);
    expect(client.project!.progress.bySprint['2.2']!.percent).toBe(100);
  });

  it('applies removals, warnings and design updates', async () => {
    const setupResult = await setup();
    const { fx, state } = setupResult;
    let client = setupResult.client;

    const runLog = path.join(fx.runsDir, 'phase-1.jsonl');
    await rm(runLog);
    const removed = await state.apply({ kind: 'run', file: runLog });
    expect(removed.map((u) => u.type)).toContain('removed');
    client = fold(client, removed);
    expect(client.project!.runs.map((r) => r.phase)).toEqual([2]);

    const phaseFile = path.join(fx.phasesDir, 'Phase-3-Maps.md');
    await rm(phaseFile);
    const updates = await state.apply({ kind: 'phase', file: phaseFile });
    client = fold(client, updates);
    expect(client.project).toEqual(wire(state.snapshot()));
    expect(client.project!.phases.map((p) => p.number)).toEqual([1, 2]);

    client = applyUpdate(client, { type: 'design', hasDesignSystem: true });
    expect(client.project!.hasDesignSystem).toBe(true);
    client = applyUpdate(client, { type: 'warnings', warnings: [{ file: 'x.md', line: 1, raw: 'r', message: 'm' }] });
    expect(client.project!.warnings).toHaveLength(1);
  });

  it('leaves a snapshot without a project unchanged', () => {
    const snapshot: ViewerSnapshot = { workspace: { kind: 'none', searched: ['/a'] }, project: null };
    expect(applyUpdate(snapshot, { type: 'design', hasDesignSystem: true })).toBe(snapshot);
  });

  it('never mutates the snapshot it is given', async () => {
    const { state, client } = await setup();
    const before = JSON.stringify(client);
    applyUpdate(client, { type: 'warnings', warnings: [] });
    applyUpdate(client, { type: 'removed', kind: 'phase', file: client.project!.phases[0]!.file, number: 1, progress: state.snapshot().progress });
    expect(JSON.stringify(client)).toBe(before);
  });
});

describe('parsing event data', () => {
  it('lists every update event', () => {
    expect([...UPDATE_EVENTS]).toEqual(['phase', 'run', 'removed', 'warnings', 'design']);
  });

  it('accepts a snapshot and rejects anything else', () => {
    expect(parseSnapshot('{"workspace":{"kind":"none","searched":[]},"project":null}')).not.toBeNull();
    expect(parseSnapshot('{"workspace":{"kind":"found","root":"/p","source":"dir"},"project":{"phases":[]}}')).not.toBeNull();
    expect(parseSnapshot('not json')).toBeNull();
    expect(parseSnapshot('{"project":null}')).toBeNull();
    expect(parseSnapshot('{"workspace":{"kind":"none"},"project":{}}')).toBeNull();
  });

  it('accepts known update types only', () => {
    expect(parseUpdate('{"type":"design","hasDesignSystem":false}')).toEqual({ type: 'design', hasDesignSystem: false });
    expect(parseUpdate('{"type":"snapshot"}')).toBeNull();
    expect(parseUpdate('{"type":"future"}')).toBeNull();
    expect(parseUpdate('[]')).toBeNull();
    expect(parseUpdate('')).toBeNull();
  });

  it('takes the last path segment with either separator', () => {
    expect(baseName('C:\\Users\\me\\trail-log')).toBe('trail-log');
    expect(baseName('/tmp/x/trail-log/')).toBe('trail-log');
  });
});
