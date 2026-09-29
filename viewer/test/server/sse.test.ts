/**
 * HTTP server + server-sent events, on a temp copy of the `multi-phase`
 * fixture (3 phases, run logs for phases 1 and 2).
 *
 * Each test starts a real server on a free loopback port (`port: 0`) and
 * talks to it with Node's `fetch` and a small `node:http` SSE reader. The
 * live tests run on real file events (Windows on the dev machine), so they
 * let the watcher settle after start before mutating the copy. Every server
 * and stream is closed in `afterEach` so the run exits cleanly.
 */
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { get, request, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/core/model.js';
import { loadProject } from '../../src/core/load.js';
import type { Workspace } from '../../src/server/detect.js';
import { startViewerServer, type Health, type ViewerServer, type ViewerServerOptions } from '../../src/server/http.js';
import { HOST } from '../../src/server/port.js';
import type { RunUpdate, ViewerSnapshot } from '../../src/server/sse.js';
import { APP_ROOT, MULTI_PHASE } from '../fixtures/index.js';

/** Time given to native watchers after start before the first mutation. */
const SETTLE_MS = 150;
/** Per-test timeout for the live tests. */
const LIVE_TIMEOUT = 15_000;

const APPENDED_EVENT =
  '{"v":1,"ts":"2026-09-21T14:05:00Z","phase":2,"wave":1,"sprint":"2.1","gate":"wave_test","result":"pass","attempt":1,"max":3,"summary":"browser checks pass"}\n';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check` is true, or fail after `timeoutMs`. */
async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 3_000, what = 'condition'): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(10);
  }
}

// ---------------------------------------------------------------------------
// SSE reader
// ---------------------------------------------------------------------------

/** One parsed SSE message. */
interface SseMessage {
  event: string;
  data: string;
  /** `Date.now()` when it arrived. */
  at: number;
}

/** An open `/api/events` stream. */
interface EventStream {
  status: number;
  contentType: string | undefined;
  messages: SseMessage[];
  /** Comment lines (without the leading `:`), e.g. heartbeats. */
  comments: string[];
  /** `true` once the server ended the response. */
  ended: boolean;
  /** Resolve with the first message named `event` from index `from` on. */
  next(event: string, timeoutMs?: number, from?: number): Promise<SseMessage>;
  close(): void;
}

const openStreams: EventStream[] = [];

/** Connect to `/api/events` and parse the stream as it arrives. */
function openEvents(baseUrl: string): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const req = get(`${baseUrl}/api/events`, { agent: false, headers: { accept: 'text/event-stream' } }, (res: IncomingMessage) => {
      res.setEncoding('utf8');
      let buffer = '';
      const stream: EventStream = {
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'],
        messages: [],
        comments: [],
        ended: false,
        async next(event, timeoutMs = 3_000, from = 0) {
          let found: SseMessage | undefined;
          await waitFor(
            () => {
              found = stream.messages.slice(from).find((m) => m.event === event);
              return found !== undefined;
            },
            timeoutMs,
            `an SSE "${event}" event`,
          );
          return found!;
        },
        close() {
          req.destroy();
        },
      };
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) stream.comments.push(line.slice(1).trim());
            else if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          if (data.length > 0) stream.messages.push({ event, data: data.join('\n'), at: Date.now() });
        }
      });
      res.on('end', () => {
        stream.ended = true;
      });
      res.on('error', () => {
        stream.ended = true;
      });
      openStreams.push(stream);
      resolve(stream);
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
}

/** Send a raw request (any method, any path, unnormalized) and read the whole answer. */
function rawRequest(
  baseUrl: string,
  method: string,
  pathname: string,
): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, method, path: pathname, agent: false }, (res) => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(method === 'GET' || method === 'HEAD' ? undefined : '{"status":"x"}');
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let base: string;
let root: string;
let runLog2: string;
/** An empty client folder, so tests don't depend on whether `dist/client/` is built. */
let emptyClient: string;
const servers: ViewerServer[] = [];

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'phase-viewer-sse-'));
  root = path.join(base, 'project');
  await cp(MULTI_PHASE.root, root, { recursive: true });
  runLog2 = path.join(root, 'docs', 'phases', '.runs', 'phase-2.jsonl');
  emptyClient = path.join(base, 'client-empty');
  await mkdir(emptyClient);
});

afterEach(async () => {
  for (const stream of openStreams.splice(0)) stream.close();
  for (const server of servers.splice(0)) await server.close();
  await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Start a server on the temp project (any free port, empty client folder). */
async function start(overrides: Partial<ViewerServerOptions> = {}): Promise<ViewerServer> {
  const server = await startViewerServer({
    port: 0,
    host: HOST,
    workspace: { kind: 'found', root, source: 'dir' },
    clientDir: emptyClient,
    ...overrides,
  });
  servers.push(server);
  return server;
}

/** Every file under `dir` with its size and mtime, for the read-only check. */
async function listing(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    const st = await stat(full);
    out[path.relative(dir, full)] = entry.isFile() ? `${st.size}:${st.mtimeMs}` : 'dir';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startViewerServer', () => {
  it('is ready in under 1 s on the multi-phase fixture', { timeout: LIVE_TIMEOUT }, async () => {
    const t0 = Date.now();
    const server = await start();
    const res = await fetch(`${server.url}/api/health`);
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('GET /api/health returns { name, version, root, pid }', async () => {
    const server = await start();
    const res = await fetch(`${server.url}/api/health`);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const pkg = JSON.parse(await readFile(path.join(APP_ROOT, 'package.json'), 'utf8')) as { name: string; version: string };
    const health = (await res.json()) as Health;
    expect(health).toEqual({ name: pkg.name, version: pkg.version, root, pid: process.pid });
  });

  it('GET /api/snapshot returns the workspace and the whole project as JSON', async () => {
    const server = await start();
    const res = await fetch(`${server.url}/api/snapshot`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const snapshot = (await res.json()) as ViewerSnapshot;
    expect(snapshot.workspace).toEqual({ kind: 'found', root, source: 'dir' });
    expect(snapshot.project).toEqual(await loadProject(root));
    expect(snapshot.project?.phases.map((p) => p.number)).toEqual([1, 2, 3]);

    const missing = await fetch(`${server.url}/api/nope`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toMatch(/^application\/json/);
  });

  it('starts without a root: the snapshot carries the workspace and no project', async () => {
    const workspace: Workspace = { kind: 'none', searched: [base] };
    const server = await start({ workspace });
    const snapshot = (await (await fetch(`${server.url}/api/snapshot`)).json()) as ViewerSnapshot;
    expect(snapshot).toEqual({ workspace, project: null });
    const health = (await (await fetch(`${server.url}/api/health`)).json()) as Health;
    expect(health.root).toBeNull();

    const stream = await openEvents(server.url);
    const first = await stream.next('snapshot');
    expect(JSON.parse(first.data)).toEqual({ workspace, project: null });
  });

  it('close() ends open event streams and stops listening', async () => {
    const server = await start();
    const stream = await openEvents(server.url);
    await stream.next('snapshot');
    expect(server.eventClients).toBe(1);
    await server.close();
    await waitFor(() => stream.ended, 2_000, 'the stream to end');
    expect(server.eventClients).toBe(0);
    await expect(fetch(`${server.url}/api/health`)).rejects.toThrow();
    await server.close(); // twice is safe
  });
});

describe('read-only', () => {
  it('answers every non-GET method with 405 and Allow: GET, HEAD, and writes nothing in the project', async () => {
    const before = await listing(root);
    const server = await start();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      for (const pathname of ['/', '/api/events', '/api/snapshot', '/api/health', '/docs/phases/Phase-1-Foundations.md']) {
        const res = await rawRequest(server.url, method, pathname);
        expect(res.status, `${method} ${pathname}`).toBe(405);
        expect(res.headers.allow).toBe('GET, HEAD');
      }
    }

    // HEAD is accepted and has no body.
    const head = await rawRequest(server.url, 'HEAD', '/api/health');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');

    // Reading everything doesn't write anything either.
    const stream = await openEvents(server.url);
    await stream.next('snapshot');
    await fetch(`${server.url}/api/snapshot`);
    stream.close();
    await server.close();
    expect(await listing(root)).toEqual(before);
  });
});

describe('GET /api/events', () => {
  it('sends a snapshot on connect, as text/event-stream', async () => {
    const server = await start();
    const stream = await openEvents(server.url);
    expect(stream.status).toBe(200);
    expect(stream.contentType).toMatch(/^text\/event-stream/);
    const first = await stream.next('snapshot');
    expect(stream.messages[0]).toBe(first);
    const snapshot = JSON.parse(first.data) as ViewerSnapshot;
    expect(snapshot.workspace).toEqual({ kind: 'found', root, source: 'dir' });
    expect(snapshot.project).toEqual(await loadProject(root));
  });

  it('a new run-log line reaches a connected client as a run event within 2 s', { timeout: LIVE_TIMEOUT }, async () => {
    const server = await start();
    const stream = await openEvents(server.url);
    const snapshot = JSON.parse((await stream.next('snapshot')).data) as { project: Project };
    const eventsBefore = snapshot.project.runs.find((r) => r.file === runLog2)?.events.length ?? 0;
    expect(eventsBefore).toBeGreaterThan(0);
    await sleep(SETTLE_MS);

    const t0 = Date.now();
    await appendFile(runLog2, APPENDED_EVENT);
    const message = await stream.next('run', 2_000);
    expect(message.at - t0).toBeLessThan(2_000);

    const update = JSON.parse(message.data) as RunUpdate;
    expect(update.type).toBe('run');
    expect(update.file).toBe(runLog2);
    expect(update.runs.events).toHaveLength(eventsBefore + 1);
    expect(update.runs.events.at(-1)?.gate).toBe('wave_test');
  });

  it('a phase edit reaches the client as a phase event', { timeout: LIVE_TIMEOUT }, async () => {
    const server = await start();
    const stream = await openEvents(server.url);
    await stream.next('snapshot');
    await sleep(SETTLE_MS);

    const file = path.join(root, 'docs', 'phases', 'Phase-3-Sharing.md');
    const text = await readFile(file, 'utf8');
    const edited = text.replace('| — | 1 | Public shelf route', '| x | 1 | Public shelf route');
    expect(edited).not.toBe(text);
    await writeFile(file, edited);

    const message = await stream.next('phase', 2_000);
    const update = JSON.parse(message.data) as { type: string; file: string; progress: Project['progress'] };
    expect(update.type).toBe('phase');
    expect(update.file).toBe(file);
    expect(update.progress.byPhase['3']?.done).toBe(1);
  });

  it('sends heartbeat comments on the configured interval', async () => {
    const server = await start({ heartbeatMs: 40 });
    const stream = await openEvents(server.url);
    await stream.next('snapshot');
    await waitFor(() => stream.comments.includes('heartbeat'), 2_000, 'a heartbeat');
  });

  it('cleans up on disconnect, and a reconnecting client gets a fresh snapshot', { timeout: LIVE_TIMEOUT }, async () => {
    const server = await start();
    const first = await openEvents(server.url);
    const before = JSON.parse((await first.next('snapshot')).data) as { project: Project };
    const eventsBefore = before.project.runs.find((r) => r.file === runLog2)?.events.length ?? 0;
    expect(server.eventClients).toBe(1);

    first.close();
    await waitFor(() => server.eventClients === 0, 2_000, 'the server to drop the closed stream');
    await sleep(SETTLE_MS);

    // Change the project while nobody is connected, and wait for the server to apply it.
    await appendFile(runLog2, APPENDED_EVENT);
    await waitFor(
      async () => {
        const snapshot = (await (await fetch(`${server.url}/api/snapshot`)).json()) as { project: Project };
        return (snapshot.project.runs.find((r) => r.file === runLog2)?.events.length ?? 0) === eventsBefore + 1;
      },
      3_000,
      'the server to apply the append',
    );

    const second = await openEvents(server.url);
    const fresh = JSON.parse((await second.next('snapshot')).data) as ViewerSnapshot;
    expect(fresh.project?.runs.find((r) => r.file === runLog2)?.events).toHaveLength(eventsBefore + 1);
    expect(fresh.project).toEqual(await loadProject(root));
    expect(server.eventClients).toBe(1);
  });
});

describe('client files', () => {
  it('serves a placeholder page while the client is not built', async () => {
    const server = await start();
    for (const pathname of ['/', '/sprint/3.3']) {
      const res = await fetch(`${server.url}${pathname}`);
      expect(res.status, pathname).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^text\/html/);
      const html = await res.text();
      expect(html).toContain('phase-viewer');
      expect(html).toContain("client isn't built");
      expect(html).toContain('/api/snapshot');
    }
  });

  it('serves built files, falls back to index.html for app routes, and refuses paths outside the client folder', async () => {
    const clientDir = path.join(base, 'client');
    await mkdir(path.join(clientDir, 'assets'), { recursive: true });
    await writeFile(path.join(clientDir, 'index.html'), '<!doctype html><title>viewer app</title>');
    await writeFile(path.join(clientDir, 'assets', 'app.js'), 'console.log("app");');
    await writeFile(path.join(base, 'secret.txt'), 'top secret');
    const server = await start({ clientDir });

    const index = await fetch(`${server.url}/`);
    expect(index.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await index.text()).toContain('viewer app');

    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(await asset.text()).toBe('console.log("app");');

    for (const route of ['/sprint/3.3', '/phase/2', '/deep/nested/route?x=1']) {
      const res = await fetch(`${server.url}${route}`);
      expect(res.status, route).toBe(200);
      expect(await res.text(), route).toContain('viewer app');
    }

    for (const attempt of ['/../secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const res = await rawRequest(server.url, 'GET', attempt);
      expect(res.body, attempt).not.toContain('top secret');
    }
  });
});
