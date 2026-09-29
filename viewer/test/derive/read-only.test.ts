/**
 * Static guard for "nothing in src/core/ writes to disk or shells out to git":
 * scans every source file under src/core/ (comments stripped) for fs write
 * APIs, child_process, and git invocations.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT } from '../fixtures/index.js';

const CORE_DIR = path.join(APP_ROOT, 'src', 'core');

/** Every `.ts` file under a folder, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Source text with block and line comments removed, so JSDoc prose can't trip the scan. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const FORBIDDEN: Array<[string, RegExp]> = [
  [
    'fs write API',
    /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|mkdtemp|mkdtempSync|rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|cp|cpSync|truncate|truncateSync|ftruncate|symlink|symlinkSync|link|linkSync|chmod|chmodSync|chown|chownSync|utimes|utimesSync|open|openSync|writeSync|write)\s*\(/,
  ],
  ['child_process import', /['"`](?:node:)?child_process['"`]/],
  ['process spawn', /(?<![.\w])(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/],
  ['git invocation', /['"`]git\b/],
];

/** Every forbidden pattern found in a source text. */
function violations(text: string): string[] {
  const code = stripComments(text);
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([name]) => name);
}

describe('src/core is read-only', () => {
  const files = sourceFiles(CORE_DIR);

  it('finds the core sources', () => {
    const rel = files.map((f) => path.relative(CORE_DIR, f).replace(/\\/g, '/'));
    expect(rel).toContain('load.ts');
    expect(rel).toContain('derive/run.ts');
    expect(rel).toContain('runlog/read.ts');
  });

  it.each(files.map((f): [string, string] => [path.relative(APP_ROOT, f), f]))('%s has no fs writes, child processes or git', (_rel, file) => {
    expect(violations(readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('the scan catches what it should', () => {
    expect(violations("import { writeFileSync } from 'node:fs';\nwriteFileSync('x', 'y');")).toEqual(['fs write API']);
    expect(violations("await fs.promises.appendFile(p, line);")).toEqual(['fs write API']);
    expect(violations("import { execSync } from 'node:child_process';")).toEqual(['child_process import']);
    expect(violations("spawn('git', ['log']);")).toEqual(['process spawn', 'git invocation']);
    expect(violations('// writeFileSync(x) in a comment\nconst m = RE.exec(s);')).toEqual([]);
  });
});
