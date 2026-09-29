import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PORT,
  findFreePort,
  formatStartup,
  HOST,
  listenOnFreePort,
  parseCliArgs,
  runCli,
  type CliIo,
  type CliResult,
  type StartServerOptions,
} from '../../src/cli.js';
import { detectWorkspace, hasPhasesDir } from '../../src/server/detect.js';
import { APP_ROOT } from '../fixtures/index.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'phase-viewer-detect-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Create `{folder}/docs/phases/` (and the folder) and return the folder. */
function project(...parts: string[]): string {
  const folder = path.join(tmp, ...parts);
  mkdirSync(path.join(folder, 'docs', 'phases'), { recursive: true });
  return folder;
}

/** Create a plain folder under the temp dir and return it. */
function folder(...parts: string[]): string {
  const dir = path.join(tmp, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('detectWorkspace', () => {
  it('finds docs/phases/ in the current folder first', async () => {
    const root = project('coord');
    project('coord', 'repo'); // a child hit doesn't compete with a cwd hit
    await expect(detectWorkspace(root)).resolves.toEqual({ kind: 'found', root, source: 'cwd' });
  });

  it('finds docs/phases/ one level up', async () => {
    const root = project('coord');
    const cwd = folder('coord', 'repo');
    folder('coord', 'repo', 'src');
    folder('coord', 'repo', 'docs'); // docs/ without phases/
    await expect(detectWorkspace(cwd)).resolves.toEqual({ kind: 'found', root, source: 'parent' });
  });

  it('finds a single immediate subfolder with docs/phases/', async () => {
    const cwd = folder('coord');
    const root = project('coord', 'repo');
    folder('coord', 'other', 'docs'); // docs/ without phases/
    writeFileSync(path.join(cwd, 'README.md'), '');
    await expect(detectWorkspace(cwd)).resolves.toEqual({ kind: 'found', root, source: 'child' });
  });

  it('returns every candidate when two subfolders have docs/phases/, and picks neither', async () => {
    const cwd = folder('coord');
    const b = project('coord', 'b-project');
    const a = project('coord', 'a-project');
    folder('coord', 'c-plain');
    const result = await detectWorkspace(cwd);
    expect(result.kind).toBe('candidates');
    expect(result).not.toHaveProperty('root');
    if (result.kind !== 'candidates') return;
    expect(result.candidates).toEqual([a, b]);
    expect(result.searched).toEqual([cwd, tmp, a, b, path.join(cwd, 'c-plain')]);
  });

  it('returns none with every folder it searched when nothing has docs/phases/', async () => {
    const cwd = folder('coord');
    const x = folder('coord', 'x');
    const y = folder('coord', 'y', 'docs');
    mkdirSync(path.join(cwd, 'z', 'docs'), { recursive: true });
    writeFileSync(path.join(cwd, 'z', 'docs', 'phases'), 'a file, not a folder');
    writeFileSync(path.join(cwd, 'notes.txt'), '');
    await expect(detectWorkspace(cwd)).resolves.toEqual({
      kind: 'none',
      searched: [cwd, tmp, x, path.dirname(y), path.join(cwd, 'z')],
    });
  });

  it('resolves a relative cwd and never throws on a missing one', async () => {
    const root = project('coord');
    const rel = path.relative(process.cwd(), root);
    await expect(detectWorkspace(rel)).resolves.toEqual({ kind: 'found', root, source: 'cwd' });

    const missing = path.join(tmp, 'gone');
    await expect(detectWorkspace(missing)).resolves.toEqual({ kind: 'none', searched: [missing, tmp] });
  });

  it('hasPhasesDir wants a folder', async () => {
    expect(await hasPhasesDir(project('p'))).toBe(true);
    expect(await hasPhasesDir(folder('q'))).toBe(false);
  });

  it('results are plain JSON data', async () => {
    project('coord', 'a');
    project('coord', 'b');
    const result = await detectWorkspace(path.join(tmp, 'coord'));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('parseCliArgs', () => {
  it('defaults the port to 4747 and leaves --dir unset', () => {
    expect(DEFAULT_PORT).toBe(4747);
    expect(parseCliArgs([])).toEqual({ ok: true, options: { port: 4747, help: false, version: false, json: false } });
  });

  it('reads --dir, --port, --help and --version (long and short)', () => {
    expect(parseCliArgs(['--dir', 'x', '--port', '5000'])).toEqual({
      ok: true,
      options: { dir: 'x', port: 5000, help: false, version: false, json: false },
    });
    expect(parseCliArgs(['-d', 'y', '-p', '6000', '-h', '-v'])).toEqual({
      ok: true,
      options: { dir: 'y', port: 6000, help: true, version: true, json: false },
    });
    expect(parseCliArgs(['--port=7000'])).toMatchObject({ ok: true, options: { port: 7000 } });
  });

  it('rejects bad ports, empty --dir, unknown options and positionals', () => {
    for (const argv of [
      ['--port', 'abc'],
      ['--port', '0'],
      ['--port', '65536'],
      ['--port', '-1'],
      ['--port', '47.5'],
      ['--dir', ''],
      ['--nope'],
      ['somewhere'],
      ['--dir'],
    ]) {
      const parsed = parseCliArgs(argv);
      expect(parsed.ok, argv.join(' ')).toBe(false);
      if (!parsed.ok) expect(parsed.error, argv.join(' ')).not.toMatch(/\n/);
    }
  });
});

/** Captures what {@link runCli} writes and the options its server starter got. */
function harness(cwd: string, fakeServer = true) {
  const out: string[] = [];
  const err: string[] = [];
  const started: StartServerOptions[] = [];
  const io: CliIo = {
    cwd,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  if (fakeServer) {
    io.startServer = async (options) => {
      started.push(options);
      return { port: options.port, close: async () => {} };
    };
  }
  return { io, out, err, started };
}

/** Occupy a free loopback port; returns the server and its port. */
async function occupyPort(): Promise<{ blocker: Server; port: number }> {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen({ port: 0, host: HOST, exclusive: true }, resolve));
  return { blocker, port: (blocker.address() as AddressInfo).port };
}

function closeNet(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('runCli', () => {
  const running: CliResult[] = [];

  afterEach(async () => {
    for (const r of running.splice(0)) await r.server?.close();
  });

  it('--dir to a missing path exits 1 with one stderr line and starts nothing', async () => {
    const missing = path.join(tmp, 'no-such-project');
    const h = harness(tmp);
    const result = await runCli(['--dir', missing], h.io);
    expect(result).toEqual({ exitCode: 1 });
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).not.toMatch(/\n/);
    expect(h.err[0]).toBe(`phase-viewer: --dir ${missing} does not exist`);
    expect(h.out).toEqual([]);
    expect(h.started).toEqual([]);
  });

  it('--dir to a file exits 1', async () => {
    const file = path.join(tmp, 'file.txt');
    writeFileSync(file, '');
    const h = harness(tmp);
    await expect(runCli(['--dir', file], h.io)).resolves.toEqual({ exitCode: 1 });
    expect(h.err).toEqual([`phase-viewer: --dir ${file} is not a folder`]);
    expect(h.started).toEqual([]);
  });

  it('--dir bypasses detection, resolving against cwd', async () => {
    // Detection from here would return two candidates.
    const cwd = folder('coord');
    const a = project('coord', 'a');
    project('coord', 'b');
    const h = harness(cwd);
    const result = await runCli(['--dir', 'a', '--port', '5123'], h.io);
    running.push(result);
    expect(result.exitCode).toBe(0);
    expect(h.started).toEqual([{ port: 5123, host: HOST, workspace: { kind: 'found', root: a, source: 'dir' } }]);
    expect(h.out).toEqual([`phase-viewer → http://localhost:5123\nroot: ${a}`]);
    expect(h.err).toEqual([]);
  });

  it('--dir accepts a folder without docs/phases/', async () => {
    const plain = folder('plain');
    const h = harness(tmp);
    const result = await runCli(['--dir', plain], h.io);
    running.push(result);
    expect(result.workspace).toEqual({ kind: 'found', root: plain, source: 'dir' });
    expect(h.started[0]?.port).toBe(DEFAULT_PORT);
  });

  it('starts with the detected root when there is no --dir', async () => {
    const cwd = folder('coord');
    const root = project('coord', 'repo');
    const h = harness(cwd);
    const result = await runCli([], h.io);
    running.push(result);
    expect(result.exitCode).toBe(0);
    expect(h.started[0]?.workspace).toEqual({ kind: 'found', root, source: 'child' });
    expect(h.out[0]).toContain(`root: ${root}`);
  });

  it('still starts when detection finds several candidates, and hands them to the server', async () => {
    const cwd = folder('coord');
    const a = project('coord', 'a');
    const b = project('coord', 'b');
    const h = harness(cwd);
    const result = await runCli([], h.io);
    running.push(result);
    expect(result.exitCode).toBe(0);
    expect(result.server).toBeDefined();
    const workspace = h.started[0]?.workspace;
    expect(workspace?.kind).toBe('candidates');
    expect(workspace).toMatchObject({ candidates: [a, b] });
    expect(h.out[0]).toContain('root: not chosen');
    expect(h.out[0]).toContain(`  ${a}\n  ${b}`);
    expect(h.err).toEqual([]);
  });

  it('still starts when detection finds nothing, and hands that to the server', async () => {
    const cwd = folder('coord');
    const h = harness(cwd);
    const result = await runCli([], h.io);
    running.push(result);
    expect(result.exitCode).toBe(0);
    expect(h.started[0]?.workspace).toEqual({ kind: 'none', searched: [cwd, tmp] });
    expect(h.out[0]).toMatch(/^phase-viewer → http:\/\/localhost:4747\nroot: none/);
  });

  it('a busy port falls through to the next free one, and the printed URL matches it', async () => {
    const root = project('proj');
    const { blocker, port: busy } = await occupyPort();
    try {
      const h = harness(tmp, false); // the real viewer server
      const result = await runCli(['--dir', root, '--port', String(busy)], h.io);
      running.push(result);
      expect(result.exitCode).toBe(0);
      const port = result.server!.port;
      expect(port).toBeGreaterThan(busy);
      expect(h.out[0]?.split('\n')[0]).toBe(`phase-viewer → http://localhost:${port}`);

      // The server carries the workspace, and is read-only.
      const res = await fetch(`http://${HOST}:${port}/api/snapshot`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { workspace: unknown };
      expect(body.workspace).toEqual({ kind: 'found', root, source: 'dir' });
      expect((await fetch(`http://${HOST}:${port}/`, { method: 'POST' })).status).toBe(405);
    } finally {
      await closeNet(blocker);
    }
  });

  it('exits 1 with one line when the server cannot start', async () => {
    const h = harness(tmp, false);
    h.io.startServer = async () => {
      throw new Error('ports 4747-4766 are all taken');
    };
    await expect(runCli(['--dir', tmp], h.io)).resolves.toEqual({ exitCode: 1 });
    expect(h.err).toEqual(["phase-viewer: couldn't start the server: ports 4747-4766 are all taken"]);
    expect(h.out).toEqual([]);
  });

  it('--help and --version print and exit 0 without starting a server', async () => {
    const h = harness(tmp);
    await expect(runCli(['--help'], h.io)).resolves.toEqual({ exitCode: 0 });
    expect(h.out[0]).toMatch(/^Usage: phase-viewer/);
    expect(h.out[0]).toContain('--dir');
    expect(h.out[0]).toContain('--port');

    const pkg = JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')) as { version: string };
    await expect(runCli(['--version'], h.io)).resolves.toEqual({ exitCode: 0 });
    expect(h.out[1]).toBe(pkg.version);
    expect(h.started).toEqual([]);
  });

  it('a bad argument exits 1 with one line', async () => {
    const h = harness(tmp);
    await expect(runCli(['--port', 'nope'], h.io)).resolves.toEqual({ exitCode: 1 });
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toMatch(/^phase-viewer: --port must be/);
    expect(h.started).toEqual([]);
  });
});

describe('ports', () => {
  it('findFreePort skips a taken port', async () => {
    const { blocker, port: busy } = await occupyPort();
    try {
      const free = await findFreePort(busy);
      expect(free).toBeGreaterThan(busy);
      // The probe released it again.
      const again = createServer();
      await expect(listenOnFreePort(again, free, HOST, 1)).resolves.toBe(free);
      await closeNet(again);
    } finally {
      await closeNet(blocker);
    }
  });

  it('listenOnFreePort gives up after its attempts', async () => {
    const { blocker, port: busy } = await occupyPort();
    try {
      const server = createServer();
      await expect(listenOnFreePort(server, busy, HOST, 1)).rejects.toThrow(`port ${busy} is taken`);
      expect(server.listening).toBe(false);
    } finally {
      await closeNet(blocker);
    }
  });
});

describe('formatStartup', () => {
  it('prints the URL, then the root', () => {
    expect(formatStartup(4748, { kind: 'found', root: '/work/proj', source: 'cwd' }, '/work/proj')).toBe(
      'phase-viewer → http://localhost:4748\nroot: /work/proj',
    );
  });
});
