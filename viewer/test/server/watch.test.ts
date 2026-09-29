/**
 * File watcher + incremental state, on a temp copy of the `multi-phase`
 * fixture (3 phases, run logs for phases 1 and 2).
 *
 * The live tests wire `watchProject` to `createProjectState` the way the
 * server does, mutate the copy, and wait for updates. They run on real file
 * events (Windows on the dev machine), so each waits for the watcher's
 * `ready`, lets it settle, and then watches for a quiet period to prove no
 * extra updates follow. After every mutation the live snapshot must equal a
 * fresh `loadProject` of the same folder.
 */
import { cp, mkdtemp, readFile, rename, rm, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from '../../src/core/load.js';
import { createProjectState, type ProjectState, type StateUpdate } from '../../src/server/state.js';
import { classifyPath, watchProject, type ProjectWatcher } from '../../src/server/watch.js';
import { MULTI_PHASE } from '../fixtures/index.js';

/** Time given to native watchers after `ready` before the first mutation. */
const SETTLE_MS = 150;
/** How long to keep listening after the expected update, to catch extras. */
const QUIET_MS = 500;
/** Per-test timeout for the live tests. */
const LIVE_TIMEOUT = 15_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check` is true, or fail after `timeoutMs`. */
async function waitFor(check: () => boolean, timeoutMs = 3_000, what = 'condition'): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(10);
  }
}

/** A temp copy of the multi-phase fixture. */
interface TempProject {
  root: string;
  phasesDir: string;
  runsDir: string;
  file: (name: string) => string;
}

async function copyFixture(): Promise<TempProject> {
  const base = await mkdtemp(path.join(tmpdir(), 'phase-viewer-watch-'));
  const root = path.join(base, 'project');
  await cp(MULTI_PHASE.root, root, { recursive: true });
  const phasesDir = path.join(root, 'docs', 'phases');
  return {
    root,
    phasesDir,
    runsDir: path.join(phasesDir, '.runs'),
    file: (name) => path.join(phasesDir, name),
  };
}

/** One update as it arrived. */
interface Received {
  at: number;
  update: StateUpdate;
}

/** State plus watcher, wired like the server. */
interface Live {
  state: ProjectState;
  watcher: ProjectWatcher;
  received: Received[];
  errors: Error[];
}

async function startLive(root: string): Promise<Live> {
  const state = await createProjectState(root);
  const received: Received[] = [];
  const errors: Error[] = [];
  const watcher = watchProject(
    root,
    (change) => {
      void state.apply(change).then((updates) => {
        const at = Date.now();
        for (const update of updates) received.push({ at, update });
      });
    },
    { onError: (err) => errors.push(err) },
  );
  await watcher.ready;
  await sleep(SETTLE_MS);
  return { state, watcher, received, errors };
}

/** A minimal phase file with one sprint (`N.1`). */
function phaseText(n: number): string {
  return [
    `# Phase ${n} — Extras`,
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
    '- Phase 3',
    '',
  ].join('\n');
}

const APPENDED_EVENT =
  '{"v":1,"ts":"2026-09-21T14:05:00Z","phase":2,"wave":1,"sprint":"2.1","gate":"wave_test","result":"pass","attempt":1,"max":3,"summary":"browser checks pass"}\n';

let project: TempProject;
let live: Live | null = null;

beforeEach(async () => {
  project = await copyFixture();
});

afterEach(async () => {
  await live?.watcher.close();
  live = null;
  await rm(path.dirname(project.root), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('classifyPath', () => {
  it('maps phase files, run logs and design docs; ignores everything else', () => {
    const root = path.resolve('some-project');
    const at = (...parts: string[]): string => path.join(root, 'docs', ...parts);
    expect(classifyPath(root, at('phases', 'Phase-3-Sharing.md'))).toBe('phase');
    expect(classifyPath(root, at('phases', 'phase-10-lower.md'))).toBe('phase');
    expect(classifyPath(root, at('phases', '.runs', 'phase-2.jsonl'))).toBe('run');
    expect(classifyPath(root, at('design', 'design-system.md'))).toBe('design');
    expect(classifyPath(root, at('design', 'screens', 'home.md'))).toBe('design');

    expect(classifyPath(root, at('phases', 'Phase-3-Sharing.md.tmp'))).toBeNull();
    expect(classifyPath(root, at('phases', 'notes.md'))).toBeNull();
    expect(classifyPath(root, at('phases', '.runs', 'phase-02.jsonl'))).toBeNull();
    expect(classifyPath(root, at('phases', '.runs', 'other.jsonl'))).toBeNull();
    expect(classifyPath(root, at('phases', 'sub', 'Phase-1-X.md'))).toBeNull();
    expect(classifyPath(root, at('Plan.html'))).toBeNull();
    expect(classifyPath(root, at('phases'))).toBeNull();
    expect(classifyPath(root, path.join(root, 'src', 'Phase-1-X.md'))).toBeNull();
    expect(classifyPath(root, path.join(path.dirname(root), 'docs', 'phases', 'Phase-1-X.md'))).toBeNull();
  });
});

describe('createProjectState', () => {
  it('starts equal to loadProject', async () => {
    const state = await createProjectState(project.root);
    expect(state.snapshot()).toEqual(await loadProject(project.root));
    expect(state.snapshot().runs.map((r) => r.phase)).toEqual([1, 2]);
  });

  it('returns no updates when a file re-reads the same, or is not a model file', async () => {
    const state = await createProjectState(project.root);
    expect(await state.apply({ kind: 'phase', file: project.file('Phase-2-Library-UI.md') })).toEqual([]);
    expect(await state.apply({ kind: 'run', file: path.join(project.runsDir, 'phase-1.jsonl') })).toEqual([]);
    expect(await state.apply({ kind: 'phase', file: project.file('notes.md') })).toEqual([]);
    expect(await state.apply({ kind: 'design', file: path.join(project.root, 'docs', 'design', 'x.md') })).toEqual([]);
  });

  it('reports the design system appearing', async () => {
    const state = await createProjectState(project.root);
    expect(state.snapshot().hasDesignSystem).toBe(false);
    const file = path.join(project.root, 'docs', 'design', 'design-system.md');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '# Design system\n');
    expect(await state.apply({ kind: 'design', file })).toEqual([{ type: 'design', hasDesignSystem: true }]);
    expect(state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('re-derives run logs when a phase edit changes which sprints run a wave test', async () => {
    const state = await createProjectState(project.root);
    const log2 = path.join(project.runsDir, 'phase-2.jsonl');
    const before = state.snapshot().runs.find((r) => r.file === log2);
    expect(before?.waves[0]?.sprints[0]?.state).toBe('testing');

    const file = project.file('Phase-2-Library-UI.md');
    const text = await readFile(file, 'utf8');
    expect(text).toContain('- ui: /library\n');
    await writeFile(file, text.replace('- ui: /library\n', '- ui: /library\n- skip-ui: true\n'));

    const updates = await state.apply({ kind: 'phase', file });
    expect(updates.map((u) => u.type)).toEqual(['phase', 'run']);
    const run = updates[1];
    expect(run?.type === 'run' && run.file).toBe(log2);
    expect(run?.type === 'run' && run.runs.waves[0]?.sprints[0]?.state).toBe('syncing');
    expect(state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('applies concurrent changes one at a time', async () => {
    const state = await createProjectState(project.root);
    await appendFile(path.join(project.runsDir, 'phase-2.jsonl'), APPENDED_EVENT);
    await rm(project.file('Phase-3-Sharing.md'));
    const [a, b] = await Promise.all([
      state.apply({ kind: 'run', file: path.join(project.runsDir, 'phase-2.jsonl') }),
      state.apply({ kind: 'phase', file: project.file('Phase-3-Sharing.md') }),
    ]);
    expect(a?.map((u) => u.type)).toEqual(['run']);
    expect(b?.map((u) => u.type)).toContain('removed');
    expect(state.snapshot()).toEqual(await loadProject(project.root));
  });
});

describe('watchProject + state (live)', () => {
  it('appending one line to a run log yields exactly one run update within 500 ms', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    const log2 = path.join(project.runsDir, 'phase-2.jsonl');
    const eventsBefore = live.state.snapshot().runs.find((r) => r.file === log2)?.events.length ?? 0;

    const start = Date.now();
    await appendFile(log2, APPENDED_EVENT);
    const l = live;
    await waitFor(() => l.received.length > 0, 3_000, 'a run update');
    const first = l.received[0];
    expect(first?.update.type).toBe('run');
    expect((first?.at ?? Infinity) - start).toBeLessThan(500);

    await sleep(QUIET_MS);
    expect(l.received.map((r) => r.update.type)).toEqual(['run']);
    const update = first?.update;
    expect(update?.type === 'run' && update.file).toBe(log2);
    expect(update?.type === 'run' && update.runs.events.length).toBe(eventsBefore + 1);
    expect(l.errors).toEqual([]);
    expect(l.state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('an editor-style replace save (unlink, then add) yields one phase update and no removal', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    const file = project.file('Phase-3-Sharing.md');
    const text = await readFile(file, 'utf8');
    const edited = text.replace('| — | 1 | Public shelf route', '| x | 1 | Public shelf route');
    expect(edited).not.toBe(text);

    await rm(file);
    await writeFile(file, edited);
    const l = live;
    await waitFor(() => l.received.length > 0, 3_000, 'a phase update');
    await sleep(QUIET_MS);

    expect(l.received.map((r) => r.update.type)).toEqual(['phase']);
    const update = l.received[0]?.update;
    expect(update?.type === 'phase' && update.file).toBe(file);
    expect(update?.type === 'phase' && update.phase.sprints[0]?.tasks[0]?.status).toBe('done');
    expect(update?.type === 'phase' && update.progress.byPhase['3']?.done).toBe(1);
    expect(l.state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('a save by rename over the file yields one phase update and no removal', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    const file = project.file('Phase-3-Sharing.md');
    const text = await readFile(file, 'utf8');
    const tmp = `${file}.tmp`;
    await writeFile(tmp, text.replace('# Sprint 3.1 — Public Shelves', '# Sprint 3.1 — Public Shelf Links'));
    await rename(tmp, file);
    const l = live;
    await waitFor(() => l.received.length > 0, 3_000, 'a phase update');
    await sleep(QUIET_MS);

    expect(l.received.map((r) => r.update.type)).toEqual(['phase']);
    const update = l.received[0]?.update;
    expect(update?.type === 'phase' && update.phase.sprints[0]?.title).toBe('Public Shelf Links');
    expect(l.state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('a new phase file yields a phase update', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    const file = project.file('Phase-4-Extras.md');
    await writeFile(file, phaseText(4));
    const l = live;
    await waitFor(() => l.received.some((r) => r.update.type === 'phase'), 3_000, 'a phase update');
    await sleep(QUIET_MS);

    const types = l.received.map((r) => r.update.type);
    expect(types.filter((t) => t === 'phase')).toHaveLength(1);
    expect(types).not.toContain('removed');
    const update = l.received.find((r) => r.update.type === 'phase')?.update;
    expect(update?.type === 'phase' && update.file).toBe(file);
    expect(update?.type === 'phase' && update.phase.number).toBe(4);
    expect(l.state.snapshot().phases.map((p) => p.number)).toEqual([1, 2, 3, 4]);
    expect(l.state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('a deleted phase file yields one removed update', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    const file = project.file('Phase-3-Sharing.md');
    await rm(file);
    const l = live;
    await waitFor(() => l.received.some((r) => r.update.type === 'removed'), 3_000, 'a removed update');
    await sleep(QUIET_MS);

    const removed = l.received.filter((r) => r.update.type === 'removed').map((r) => r.update);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ type: 'removed', kind: 'phase', file, number: 3 });
    expect(l.received.map((r) => r.update.type)).not.toContain('phase');
    expect(l.state.snapshot().phases.map((p) => p.number)).toEqual([1, 2]);
    expect(l.state.snapshot()).toEqual(await loadProject(project.root));
  });

  it('ignores files the model does not read', { timeout: LIVE_TIMEOUT }, async () => {
    live = await startLive(project.root);
    await writeFile(project.file('notes.md'), 'scratch\n');
    await writeFile(path.join(project.runsDir, 'phase-2.jsonl.bak'), APPENDED_EVENT);
    await sleep(QUIET_MS);
    expect(live.received).toEqual([]);
  });
});
