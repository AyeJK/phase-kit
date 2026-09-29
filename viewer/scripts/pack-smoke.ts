#!/usr/bin/env node
/**
 * Smoke test for the published package: pack it, install the tarball the way
 * a user would, and start it against a fixture project.
 *
 *     npm run build && tsx scripts/pack-smoke.ts
 *
 * 1. `npm pack` into a temp folder, and check the tarball holds only
 *    `dist/`, `README.md`, `LICENSE` and `package.json` (plus the files the
 *    viewer can't run without).
 * 2. `npm install` the tarball into a fresh temp folder and check the bin
 *    starts with the `#!/usr/bin/env node` shebang (LF, no CR) and that no
 *    build-time package (React, Vite, TypeScript…) came along.
 * 3. Copy the `multi-phase` fixture next to it, and run the installed
 *    `phase-viewer --json` through npm's bin shim (`.cmd` on Windows) with the
 *    fixture as the working folder, so the root comes from detection, as with
 *    `npx phase-viewer`. `PHASE_VIEWER_INSTANCE_DIR` points at the temp folder
 *    so it can't reuse a viewer that's already running.
 * 4. Wait for `/api/health` to answer and check it's ready within
 *    {@link READY_LIMIT_MS}, that it reports this package's version and the
 *    fixture root, that `/` serves the built dashboard and `/api/snapshot`
 *    carries the fixture's phases, and that the instance file records the
 *    package version.
 * 5. Run the bin a second time and check it reuses the first server.
 *
 * The server is killed (process tree on Windows) and every temp folder
 * removed at the end, pass or fail. Prints a short report and exits 1 on the
 * first failed check. Needs `npm run build` first; `npm pack` runs no build.
 */
import {
  execFileSync,
  execSync,
  spawn,
  type ChildProcess,
  type ExecSyncOptionsWithStringEncoding,
  type SpawnOptions,
} from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

/** The package folder (`viewer/`). */
const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The fixture project the installed viewer is started against. */
const FIXTURE = fileURLToPath(new URL('../test/fixtures/multi-phase/', import.meta.url));

/** Longest allowed time from starting the bin to `/api/health` answering. */
const READY_LIMIT_MS = 5_000;

/** Longest wait for the `--json` line before giving up. */
const START_TIMEOUT_MS = 20_000;

/** Files the tarball must contain. */
const REQUIRED_FILES = ['package.json', 'README.md', 'LICENSE', 'dist/cli.js', 'dist/server/http.js', 'dist/client/index.html'];

/** Build-time packages that must not be installed with the viewer. */
const BUILD_ONLY_PACKAGES = ['react', 'react-dom', 'vite', 'typescript', 'tsx', 'vitest', '@playwright/test', '@vitejs/plugin-react'];

const isWindows = process.platform === 'win32';

class SmokeFailure extends Error {}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message);
}

function report(label: string, value: string): void {
  process.stdout.write(`  ${label.padEnd(14)} ${value}\n`);
}

/** `true` when a tarball path is one the `files` whitelist allows. */
function isAllowedTarballPath(file: string): boolean {
  return file === 'package.json' || file === 'README.md' || file === 'LICENSE' || file.startsWith('dist/');
}

/** A path in the form used for comparing folders (real path, case-folded on Windows). */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    let resolved = path.resolve(p);
    try {
      resolved = realpathSync(resolved);
    } catch {
      // Compare as given.
    }
    return isWindows ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

/**
 * One `cmd.exe` command line. Windows runs `.cmd` files (npm, the bin shim)
 * only through the shell, and Node wants the whole line as one string there.
 * The arguments here are temp paths and flags, so quoting is enough.
 */
function commandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map((part) => (/[\s"&|<>^()]/.test(part) ? `"${part}"` : part)).join(' ');
}

/** Run npm and return its stdout. */
function npm(args: readonly string[], cwd: string): string {
  const options: ExecSyncOptionsWithStringEncoding = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return isWindows ? execSync(commandLine('npm', args), options) : execFileSync('npm', args, options);
}

/** `npm pack --json` result, trimmed to what the smoke test reads. */
interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: { path: string }[];
}

function parsePackJson(stdout: string): PackResult {
  const start = stdout.indexOf('[');
  check(start >= 0, `npm pack --json printed no JSON:\n${stdout}`);
  const parsed: unknown = JSON.parse(stdout.slice(start));
  check(Array.isArray(parsed) && parsed.length === 1, 'npm pack --json should describe exactly one tarball');
  return parsed[0] as PackResult;
}

/** Top-level package names under `node_modules/`, scoped ones as `@scope/name`. */
function installedPackages(nodeModules: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(path.join(nodeModules, entry.name))) names.push(`${entry.name}/${scoped}`);
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/** Start the installed bin through npm's shim with `--json`. */
function startBin(bin: string, cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const options: SpawnOptions = {
    cwd,
    env,
    detached: !isWindows, // its own process group, so the whole group can be killed
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };
  return isWindows ? spawn(commandLine(bin, ['--json']), { ...options, shell: true }) : spawn(bin, ['--json'], options);
}

/** What the `--json` line carries. */
interface StartupJson {
  url: string;
  reused: boolean;
  root: string | null;
}

/** The child's first stdout line that parses as the `--json` object. Rejects on exit, error or timeout. */
function readJsonLine(child: ChildProcess, timeoutMs: number): Promise<StartupJson> {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => finish(new SmokeFailure(`no --json line within ${timeoutMs} ms\nstdout: ${out}\nstderr: ${err}`)), timeoutMs);
    const finish = (result: StartupJson | Error) => {
      clearTimeout(timer);
      child.stdout?.removeAllListeners('data');
      child.removeAllListeners('exit');
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
      for (const line of out.split('\n')) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (typeof parsed === 'object' && parsed !== null && typeof (parsed as StartupJson).url === 'string') {
            finish(parsed as StartupJson);
            return;
          }
        } catch {
          // Not the JSON line (or not all of it yet).
        }
      }
    });
    child.once('error', (e) => finish(e));
    child.once('exit', (code) => finish(new SmokeFailure(`phase-viewer exited (${code}) before printing its URL\nstdout: ${out}\nstderr: ${err}`)));
  });
}

/** Resolves with the child's exit code. */
function exitCode(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

/** GET a URL as JSON. */
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  check(res.ok, `${url} answered ${res.status}`);
  return res.json();
}

/** Poll `/api/health` until it answers or `deadline` passes. */
async function waitForHealth(base: string, deadline: number): Promise<Record<string, unknown>> {
  let last = '';
  while (performance.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
      last = `status ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new SmokeFailure(`/api/health didn't answer (${last})`);
}

/** Kill the child and everything it started. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (isWindows) execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

/** Kill a process by id if it's still alive. */
function killPid(pid: number): void {
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
}

async function main(): Promise<void> {
  const pkg = JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')) as { name: string; version: string };
  check(
    existsSync(path.join(APP_ROOT, 'dist/cli.js')) && existsSync(path.join(APP_ROOT, 'dist/client/index.html')),
    'dist/ is missing or incomplete: run `npm run build` first',
  );

  const work = await mkdtemp(path.join(tmpdir(), 'phase-viewer-smoke-'));
  const packDir = path.join(work, 'pack');
  const installDir = path.join(work, 'install');
  const project = path.join(work, 'multi-phase');
  const instanceDir = path.join(work, 'instances');
  const children: ChildProcess[] = [];
  let serverPid: number | null = null;

  process.stdout.write(`pack-smoke: ${pkg.name}@${pkg.version}\n`);
  try {
    // 1. Pack.
    await mkdir(packDir);
    const packed = parsePackJson(npm(['pack', '--json', '--pack-destination', packDir], APP_ROOT));
    const tarball = path.join(packDir, path.basename(packed.filename));
    const files = packed.files.map((f) => f.path.replace(/\\/g, '/')).sort();
    const strays = files.filter((f) => !isAllowedTarballPath(f));
    check(strays.length === 0, `tarball has files outside dist/, README.md, LICENSE, package.json:\n  ${strays.join('\n  ')}`);
    const missing = REQUIRED_FILES.filter((f) => !files.includes(f));
    check(missing.length === 0, `tarball is missing ${missing.join(', ')}`);
    const topLevel = [...new Set(files.map((f) => (f.includes('/') ? `${f.split('/')[0]}/` : f)))];
    report('tarball', `${path.basename(tarball)}, ${files.length} files, ${kb(packed.size)} packed, ${kb(packed.unpackedSize)} unpacked`);
    report('contents', topLevel.join(', '));

    // 2. Install.
    await mkdir(installDir);
    await writeFile(path.join(installDir, 'package.json'), `${JSON.stringify({ name: 'phase-viewer-smoke', private: true })}\n`);
    let t = performance.now();
    npm(['install', tarball, '--no-audit', '--no-fund', '--prefer-offline', '--loglevel=error'], installDir);
    report('install', `${ms(performance.now() - t)}`);

    const nodeModules = path.join(installDir, 'node_modules');
    const cli = readFileSync(path.join(nodeModules, 'phase-viewer/dist/cli.js'), 'utf8');
    check(cli.startsWith('#!/usr/bin/env node\n'), 'dist/cli.js must start with "#!/usr/bin/env node" and an LF line end');
    const installed = installedPackages(nodeModules);
    const buildOnly = installed.filter((name) => BUILD_ONLY_PACKAGES.includes(name));
    check(buildOnly.length === 0, `build-time packages were installed: ${buildOnly.join(', ')}`);
    report('installed', installed.join(', '));

    // 3. Start through the npm shim, from the fixture folder.
    await cp(FIXTURE, project, { recursive: true });
    await mkdir(instanceDir);
    const env = { ...process.env, PHASE_VIEWER_INSTANCE_DIR: instanceDir };
    const bin = path.join(nodeModules, '.bin', isWindows ? 'phase-viewer.cmd' : 'phase-viewer');
    check(existsSync(bin), `npm didn't create the bin shim ${bin}`);

    t = performance.now();
    const first = startBin(bin, project, env);
    children.push(first);
    const startup = await readJsonLine(first, START_TIMEOUT_MS);
    const jsonMs = performance.now() - t;
    const health = await waitForHealth(startup.url, t + START_TIMEOUT_MS);
    const readyMs = performance.now() - t;
    if (typeof health.pid === 'number') serverPid = health.pid;
    report('start', `--json line ${ms(jsonMs)}, /api/health ready ${ms(readyMs)} (limit ${ms(READY_LIMIT_MS)})`);
    report('url', startup.url);

    // 4. What it serves.
    check(readyMs < READY_LIMIT_MS, `not ready within ${READY_LIMIT_MS} ms (took ${Math.round(readyMs)} ms)`);
    check(startup.reused === false, 'first start reported reused: true');
    check(startup.root !== null && samePath(startup.root, project), `--json root is ${startup.root}, expected ${project}`);
    check(health.name === pkg.name, `/api/health name is ${String(health.name)}`);
    check(health.version === pkg.version, `/api/health version is ${String(health.version)}, expected ${pkg.version}`);
    check(typeof health.root === 'string' && samePath(health.root, project), `/api/health root is ${String(health.root)}`);

    const page = await fetch(`${startup.url}/`, { signal: AbortSignal.timeout(2_000) });
    const html = await page.text();
    check(page.ok && (page.headers.get('content-type') ?? '').startsWith('text/html'), `/ answered ${page.status} ${page.headers.get('content-type')}`);
    const script = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    check(script !== undefined, '/ is not the built dashboard (no /assets/*.js script tag)');
    const asset = await fetch(`${startup.url}${script}`, { signal: AbortSignal.timeout(2_000) });
    await asset.arrayBuffer();
    check(asset.ok, `${script} answered ${asset.status}`);

    const snapshot = (await getJson(`${startup.url}/api/snapshot`)) as { project: { phases: unknown[] } | null };
    const phases = snapshot.project?.phases.length ?? 0;
    check(phases > 0, '/api/snapshot has no phases for the fixture');
    report('dashboard', `/ serves ${script}, snapshot has ${phases} phases`);

    const instanceFiles = readdirSync(instanceDir).filter((f) => f.endsWith('.json'));
    check(instanceFiles.length === 1, `expected one instance file, found ${instanceFiles.length}`);
    const instance = JSON.parse(readFileSync(path.join(instanceDir, instanceFiles[0]!), 'utf8')) as { version?: unknown; port?: unknown };
    check(instance.version === pkg.version, `instance file version is ${String(instance.version)}, expected ${pkg.version}`);
    report('instance', `version ${String(instance.version)}, port ${String(instance.port)}`);

    // 5. A second start reuses the first.
    t = performance.now();
    const second = startBin(bin, project, env);
    children.push(second);
    const again = await readJsonLine(second, START_TIMEOUT_MS);
    const code = await exitCode(second);
    check(again.reused === true && again.url === startup.url, `second start didn't reuse the first: ${JSON.stringify(again)}`);
    check(code === 0, `second start exited ${code}`);
    report('reuse', `reused ${again.url} in ${ms(performance.now() - t)}`);

    process.stdout.write('pack-smoke: ok\n');
  } finally {
    for (const child of children) killTree(child);
    if (serverPid !== null) killPid(serverPid);
    await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err instanceof SmokeFailure ? err.message : (err.stack ?? err.message)) : String(err);
  process.stderr.write(`pack-smoke: FAILED: ${message}\n`);
  process.exit(1);
});
