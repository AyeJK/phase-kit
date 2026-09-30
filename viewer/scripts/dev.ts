#!/usr/bin/env node
/**
 * `npm run dev`: the whole dev loop in one process.
 *
 *     tsx scripts/dev.ts [--client-port 5173] [--server-port 4747]
 *                        [--fixture trail-log] [--script retry|escalation|none] [--escalate]
 *                        [--interval 2000] [--start-delay <ms>] [--stale | --as-is]
 *     tsx scripts/dev.ts --replay <run-log.jsonl> [--from <project>] [--start-at <ts>] [--speed 30] [--max-gap 4000]
 *                        [--reset-later] [--fill-tasks] ...
 *     tsx scripts/dev.ts --project <folder> [--client-port 5173] [--server-port 4747]
 *
 * 1. Copies the dev fixture (or, with `--from`, that project's `docs/`) to a
 *    temp folder (`simulate-run.ts`), reset for the replay when there is one.
 * 2. Starts the viewer server (`server/http.ts`) on that copy, on the first
 *    free port from `--server-port`.
 * 3. Starts Vite on `--client-port` with `/api` proxied to that server, so
 *    the client gets hot reload and the live event stream from one origin.
 * 4. Plays the simulated run on the copy (`--script none` to skip it), or
 *    the `--replay` run log.
 *
 * With `--project`, steps 1 and 4 are skipped: the server reads that folder
 * in place (a real project with `docs/phases/`) and nothing writes to it.
 *
 * Ctrl+C stops everything and deletes the copy. Playwright starts this same
 * command as its web server (see `playwright.config.ts`).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { startViewerServer } from '../src/server/http.js';
import { HOST } from '../src/server/port.js';
import {
  DEFAULT_INTERVAL_MS,
  fillTasks,
  isScriptName,
  parseMs,
  parseSpeed,
  prepareFixture,
  prepareReplay,
  readReplay,
  SCRIPT_NAMES,
  simulateRun,
  type Freshness,
  type ScriptStep,
} from './simulate-run.js';

/** Vite's port when `--client-port` isn't given. */
const DEFAULT_CLIENT_PORT = 5173;
/** First server port tried when `--server-port` isn't given (the CLI's default). */
const DEFAULT_SERVER_PORT = 4747;
/** Time before the first scripted step, so a browser can load first. */
const DEFAULT_START_DELAY_MS = 4_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'client-port': { type: 'string' },
      'server-port': { type: 'string' },
      fixture: { type: 'string' },
      from: { type: 'string' },
      project: { type: 'string' },
      script: { type: 'string' },
      escalate: { type: 'boolean' },
      replay: { type: 'string' },
      'start-at': { type: 'string' },
      speed: { type: 'string' },
      'max-gap': { type: 'string' },
      'reset-later': { type: 'boolean' },
      'fill-tasks': { type: 'boolean' },
      interval: { type: 'string' },
      'start-delay': { type: 'string' },
      stale: { type: 'boolean' },
      'as-is': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });

  const clientPort = values['client-port'] === undefined ? DEFAULT_CLIENT_PORT : parsePort(values['client-port'], '--client-port');
  const serverPort = values['server-port'] === undefined ? DEFAULT_SERVER_PORT : parsePort(values['server-port'], '--server-port');
  const project = values.project === undefined ? null : resolve(values.project);
  if (
    project &&
    (values.fixture !== undefined ||
      values.from !== undefined ||
      values.replay !== undefined ||
      values.escalate ||
      (values.script !== undefined && values.script !== 'none'))
  ) {
    throw new Error('--project serves a real folder read-only; it can\'t be combined with --fixture, --from or a simulated run');
  }
  const replay = values.replay === undefined ? null : resolve(values.replay);
  const script = project ? 'none' : values.escalate ? 'escalation' : (values.script ?? 'retry');
  if (!isScriptName(script)) throw new Error(`--script must be one of ${SCRIPT_NAMES.join(', ')}`);
  const intervalMs = values.interval === undefined ? DEFAULT_INTERVAL_MS : parseMs(values.interval);
  if (intervalMs === null) throw new Error('--interval must be a whole number of milliseconds');
  const startDelayMs = values['start-delay'] === undefined ? DEFAULT_START_DELAY_MS : parseMs(values['start-delay']);
  if (startDelayMs === null) throw new Error('--start-delay must be a whole number of milliseconds');
  const speed = values.speed === undefined ? undefined : parseSpeed(values.speed);
  if (speed === null) throw new Error('--speed must be a number above 0');
  const maxGapMs = values['max-gap'] === undefined ? undefined : parseMs(values['max-gap']);
  if (maxGapMs === null) throw new Error('--max-gap must be a whole number of milliseconds');
  const freshness: Freshness = values['as-is'] ? 'as-is' : values.stale ? 'stale' : 'fresh';

  const fixture = project
    ? { root: project, cleanup: async () => {} }
    : await prepareFixture({ fixture: values.fixture, source: values.from, freshness });
  let steps: ScriptStep[] | undefined;
  let origin: number | undefined;
  if (replay) {
    origin = Date.now() + startDelayMs;
    steps = await prepareReplay(fixture.root, await readReplay(replay), {
      startAt: values['start-at'],
      origin,
      resetLater: values['reset-later'],
    });
    if (values['fill-tasks']) steps = await fillTasks(fixture.root, steps);
  }
  const server = await startViewerServer({
    port: serverPort,
    host: HOST,
    workspace: { kind: 'found', root: fixture.root, source: 'dir' },
  });

  // vite.config.ts reads the proxy target from here.
  process.env.PHASE_VIEWER_API = server.url;
  const vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { host: HOST, port: clientPort, strictPort: values['client-port'] !== undefined },
  });
  await vite.listen();

  const simulation = simulateRun({ root: fixture.root, script, steps, speed, maxGapMs, origin, intervalMs, startDelayMs });
  const playing = replay ? `replay of ${replay}` : script === 'none' ? null : `${script}, a step every ${intervalMs} ms`;

  const clientUrl = vite.resolvedUrls?.local[0] ?? `http://${HOST}:${clientPort}/`;
  process.stdout.write(
    [
      `phase-viewer dev → ${clientUrl}`,
      `api: ${server.url} (proxied at /api)`,
      `project: ${fixture.root}`,
      playing === null ? 'simulated run: off' : `simulated run: ${playing}`,
      '',
    ].join('\n'),
  );
  void simulation.done.then(
    () => {
      if (playing !== null) process.stdout.write('simulated run: finished\n');
    },
    (err: unknown) => process.stderr.write(`simulated run failed: ${err instanceof Error ? err.message : String(err)}\n`),
  );

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    simulation.stop();
    void Promise.allSettled([vite.close(), server.close()])
      .then(() => fixture.cleanup())
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

function parsePort(raw: string, flag: string): number {
  const port = parseMs(raw);
  if (port === null || port < 1 || port > 65535) throw new Error(`${flag} must be a port number from 1 to 65535`);
  return port;
}

main().catch((err: unknown) => {
  process.stderr.write(`dev: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
