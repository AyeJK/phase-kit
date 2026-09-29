/**
 * Dogfood: parse this project's own phase plans (`../../docs/phases/` from the
 * app root) and expect zero warnings. The folder lives outside the git repo,
 * so in a fresh clone or CI it's missing and the whole suite is skipped.
 * Only `Phase-*.md` files directly in the folder are read; `.runs/` is ignored.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOGFOOD_PHASES_DIR } from '../fixtures/index.js';
import { parseFixture } from './helpers.js';

function phaseFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^Phase-\d+.*\.md$/i.test(name))
    .map((name) => path.join(dir, name))
    .filter((file) => statSync(file).isFile())
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

const FILES = phaseFiles(DOGFOOD_PHASES_DIR);

describe.skipIf(FILES.length === 0)(`dogfood: ${DOGFOOD_PHASES_DIR}`, () => {
  const cases = FILES.map((file): [string, string] => [path.basename(file), file]);
  it.each(cases)('%s parses with zero warnings', (_name, file) => {
    const fx = parseFixture(file);
    expect(fx.warnings).toEqual([]);
    expect(fx.phase.number).toBe(Number(/^Phase-(\d+)/i.exec(path.basename(file))![1]));
    expect(fx.phase.sprints.length).toBeGreaterThan(0);
    for (const sprint of fx.phase.sprints) {
      expect(sprint.goal, `sprint ${sprint.id} goal`).not.toBeNull();
      expect(sprint.tasks.length, `sprint ${sprint.id} tasks`).toBeGreaterThan(0);
    }
  });
});
