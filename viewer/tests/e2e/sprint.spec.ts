/**
 * A phase's content on the rail (the old Phase page and Sprint detail
 * checks, moved onto the rail's heading and sprint cards in Sprints 7.3 and
 * 7.4), in the list view at `/list?phase=N`, on the `multi-phase` fixture:
 *
 * - Phase 1 is complete; sprint 1.1 has inline code in a task.
 * - Phase 2 has a blocked task (sprint 2.1), a verification block with an
 *   unknown key (2.3) and a sprint with no verification block (2.2).
 * - Phase 3 has no run log; sprint 3.1 has a deferred task and 3.2 a sparse
 *   table row that is also a MANUAL task.
 *
 * The breadcrumb, the phase intro, trailing sections (Scope Guard, Risk
 * Mitigations), unknown sprint sections, files changed and the run history
 * timeline were Sprint detail and Phase page only; they aren't part of the
 * rail, so their checks went with those screens. A failed step's summary
 * and how it was fixed are checked in Run notes (`rail.spec.ts`).
 *
 * The shared `webServer` serves `trail-log`, so this file starts a dev loop
 * of its own on a temp copy of `multi-phase` (nothing is played on it): the
 * viewer server plus Vite with `/api` proxied to it, as `harness.ts` does for
 * `trail-log`. Ports 4810 / 4811 (see `harness.ts`).
 */
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { prepareFixture, type PreparedFixture } from '../../scripts/simulate-run.js';
import { startViewerServer, type ViewerServer } from '../../src/server/http.js';
import { HOST } from '../../src/server/port.js';

const CLIENT_PORT = 4810;
const SERVER_PORT = 4811;
const VITE_CONFIG = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

/** The part of `document` the scroll check reads (this file is type-checked without the DOM lib). */
interface PageDocument {
  document: { documentElement: { scrollWidth: number; clientWidth: number } };
}

let fixture: PreparedFixture | null = null;
let server: ViewerServer | null = null;
let vite: ViteDevServer | null = null;
const baseURL = `http://${HOST}:${CLIENT_PORT}`;

/** `--manual` as computed, in either theme (dark `#a78bfa`, light `#6d28d9`). */
const MANUAL_RGB = /^rgb\((167, 139, 250|109, 40, 217)\)$/;

test.beforeAll(async () => {
  fixture = await prepareFixture({ fixture: 'multi-phase', freshness: 'as-is' });
  server = await startViewerServer({
    port: SERVER_PORT,
    host: HOST,
    workspace: { kind: 'found', root: fixture.root, source: 'dir' },
  });
  // vite.config.ts reads its proxy target from here; the inline proxy below says the same.
  process.env.PHASE_VIEWER_API = server.url;
  vite = await createViteServer({
    configFile: VITE_CONFIG,
    logLevel: 'silent',
    server: { host: HOST, port: CLIENT_PORT, strictPort: true, proxy: { '/api': { target: server.url } } },
  });
  await vite.listen();
});

test.afterAll(async () => {
  await Promise.allSettled([vite?.close(), server?.close()]);
  vite = null;
  server = null;
  await fixture?.cleanup();
  fixture = null;
});

/** Open a route on the multi-phase dev loop and wait for the first snapshot. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(`${baseURL}${route}`);
  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'live');
}

/** How far the page scrolls sideways (0 or less means no horizontal scroll). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = (globalThis as unknown as PageDocument).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

test.describe('the rail in the list view', () => {
  /** Open a sprint card on the rail. */
  async function openCard(page: Page, id: string) {
    const card = page.locator(`article[data-sprint-card="${id}"]`);
    await card.getByTestId('card-toggle').click();
    await expect(card).toHaveAttribute('data-open', 'true');
    return card;
  }

  test('header and every sprint card in plan order', async ({ page }) => {
    await open(page, '/list?phase=2');
    const phasePage = page.getByTestId('list-main');
    await expect(phasePage.getByTestId('phase-rail')).toHaveAttribute('data-phase', '2');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 2: Library UI');
    await expect(page.getByTestId('phase-progress-text')).toHaveText('1/8 tasks');
    // The phase's status bar: the sprint bar over every task in the phase.
    const phaseBar = page.getByTestId('phase-status-bar');
    await expect(phaseBar).toHaveClass(/started/);
    await expect(phaseBar).toHaveAttribute('aria-label', /^1 complete, 1 running, 1 blocked, \d+ not started/);
    await expect(phaseBar.locator('i').first()).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('phase-status')).toHaveText('1 task blocked');
    // No file path under the title.
    await expect(phasePage).not.toContainText('docs/phases/Phase-2-Library-UI.md');
    await expect(phasePage.locator('h2.rail-h')).toHaveText('Sprints');

    const order = await phasePage.locator('article[data-sprint-card]').evaluateAll((cards) =>
      cards.map((c) => (c as unknown as { getAttribute(name: string): string | null }).getAttribute('data-sprint-card')),
    );
    expect(order).toEqual(['2.1', '2.2', '2.3']);
    await expect(phasePage.locator('article[data-sprint-card="2.1"] .sid')).toHaveText('Sprint 2.1');

    // A card: goal, tasks, criteria, dependencies, verification. No line number.
    const s21 = await openCard(page, '2.1');
    await expect(s21.getByTestId('card-goal')).toHaveText('Show every book as a cover grid with sort and filter.');
    await expect(s21.locator('.src')).toHaveCount(0);
    await expect(s21.locator('.card-sub')).toHaveText('Tasks1/4');
    // Status bar: one segment per status present, in bar order.
    const bar = s21.getByTestId('card-status-bar');
    await expect(bar).toHaveAttribute('aria-label', '1 complete, 1 running, 1 blocked, 1 not started');
    await expect(bar.locator('i')).toHaveCount(4);
    await expect(bar.locator('i').first()).toHaveAttribute('data-status', 'done');
    await expect(s21.getByTestId('tasks-table').locator('tr')).toHaveCount(4);
    await expect(s21.getByTestId('criteria').locator('li')).toHaveCount(2);
    await expect(s21.locator('.plain li')).toHaveText([
      'Phase 1 (import pipeline fills the books table)',
      'Sprint 1.2 (dedupe keeps the grid free of repeats)',
    ]);
    await expect(s21.locator('.rail-kv .k')).toHaveText(['cli', 'ui', 'skills', 'viewports', 'assert', 'assert']);

    // No Verification block, and an unknown key, both render.
    const s22 = await openCard(page, '2.2');
    await expect(s22.locator('.rail-kv')).toHaveCount(0);
    await expect(s22.locator('[data-row="verification"] summary')).toHaveText('VerificationNone');
    const s23 = await openCard(page, '2.3');
    await expect(s23.locator('.rail-kv li').last()).toHaveText('timeout30');

    // The only buttons are the card toggles (the rows are <summary>).
    await expect(page.locator('main button')).toHaveCount(3);
    await expect(page.locator('main button.card-toggle')).toHaveCount(3);
  });

  test('a card toggle opens and closes its card; the status bar stays', async ({ page }) => {
    await open(page, '/list?phase=2');
    const card = page.locator('article[data-sprint-card="2.1"]');
    const toggle = card.getByRole('button', { name: /Sprint 2\.1/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'sb2.1');
    await expect(card.getByTestId('card-body')).toBeHidden();
    await expect(card.getByTestId('card-status-bar')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByTestId('tasks-table')).toBeVisible();
    // Other cards are untouched.
    await expect(page.locator('article[data-sprint-card="2.2"] [data-testid="card-body"]')).toBeHidden();

    await toggle.click();
    await expect(card.getByTestId('tasks-table')).toBeHidden();
    await expect(card.getByTestId('card-status-bar')).toBeVisible();
  });

  test('criteria, dependencies and verification are collapsed rows, closed by default', async ({ page }) => {
    await open(page, '/list?phase=2');
    const card = await openCard(page, '2.1');
    const rows = card.locator('details.card-row');
    await expect(rows.locator('summary')).toHaveText([
      'Acceptance criteria2',
      'DependenciesPhase 1, Sprint 1.2',
      'Verification6',
      'Run notes1',
    ]);
    for (const row of await rows.all()) await expect(row).not.toHaveAttribute('open');
    await expect(card.getByTestId('criteria')).toBeHidden();

    await card.locator('[data-row="criteria"] summary').click();
    await expect(card.locator('[data-row="criteria"]')).toHaveAttribute('open');
    await expect(card.getByTestId('criteria')).toBeVisible();
    // The others stay closed.
    await expect(card.locator('[data-row="dependencies"] .plain')).toBeHidden();

    await card.locator('[data-row="criteria"] summary').click();
    await expect(card.getByTestId('criteria')).toBeHidden();
  });

  test('not-started tasks are highlighted once their sprint has begun', async ({ page }) => {
    await open(page, '/list?phase=2');
    // 2.1 has a done task, so its not-started task 4 stands out, in the table and the bar.
    const s21 = await openCard(page, '2.1');
    await expect(s21.locator('tr.remaining')).toHaveCount(1);
    await expect(s21.locator('tr.remaining')).toHaveAttribute('data-task', '4');
    await expect(s21.getByTestId('card-status-bar')).toHaveClass(/started/);
    // 2.2 hasn't begun: its not-started tasks stay plain.
    const s22 = await openCard(page, '2.2');
    await expect(s22.locator('tr[data-status="todo"]').first()).toBeVisible();
    await expect(s22.locator('tr.remaining')).toHaveCount(0);
    await expect(s22.getByTestId('card-status-bar')).not.toHaveClass(/started/);
  });

  // Moved from Sprint detail (Sprint 7.4): the same tasks table, now on the card.
  test('task rows: a blocked note, a deferred task struck through, a sparse row and inline code', async ({ page }) => {
    await open(page, '/list?phase=2');
    // A blocked task: the needs-you icon and a note under the text.
    const blocked = (await openCard(page, '2.1')).getByTestId('tasks-table').locator('tr[data-status="blocked"]');
    await expect(blocked.locator('.i.needs')).toHaveCount(1);
    await expect(blocked.locator('.note')).toHaveText('Blocked: waiting on you.');

    await open(page, '/list?phase=3');
    // A deferred task is struck through, its status word in the status column.
    const deferred = (await openCard(page, '3.1')).getByTestId('tasks-table').locator('tr[data-status="deferred"]');
    await expect(deferred).toHaveClass(/cut/);
    await expect(deferred.locator('.st')).toHaveText('Deferred');
    // A sparse row renders its empty cells, and its text where it belongs.
    const sparse = (await openCard(page, '3.2')).getByTestId('tasks-table').locator('tr[data-task="3"]');
    await expect(sparse.locator('.t')).toHaveText('Manual check against a hand-counted month');
    // It is also a MANUAL task: its own violet manual icon and the word Manual, not blocked's pink, and no note.
    await expect(sparse).toHaveAttribute('data-status', 'manual');
    await expect(sparse.locator('td.st.manual .i.manual')).toHaveCount(1);
    await expect(sparse.locator('.i.needs')).toHaveCount(0);
    await expect(sparse.locator('.st')).toHaveText('Manual');
    await expect(sparse.locator('td.st')).toHaveCSS('color', MANUAL_RGB);
    await expect(sparse.locator('.note')).toHaveCount(0);
    // Its status-bar segment is violet too, right after where blocked would sit.
    const manualSeg = page.locator('article[data-sprint-card="3.2"] [data-testid="card-status-bar"] i[data-status="manual"]');
    await expect(manualSeg).toHaveCount(1);
    await expect(manualSeg).toHaveCSS('background-color', MANUAL_RGB);
    // A manual task in a sprint that hasn't started leaves the card Not started.
    await expect(page.locator('article[data-sprint-card="3.2"]')).toHaveAttribute('data-state', 'not-started');

    await open(page, '/list?phase=1');
    // Inline code in a task renders as code.
    const s11 = await openCard(page, '1.1');
    await expect(s11.getByTestId('tasks-table').locator('tr[data-task="1"] .t code')).toHaveText('books');
  });

  test('a finished phase and a phase not started', async ({ page }) => {
    await open(page, '/list?phase=1');
    await expect(page.getByTestId('phase-status')).toHaveText('Complete');
    await expect(page.getByTestId('phase-progress-text')).toHaveText('6/6 tasks');
    // A Complete card drops its status bar; the badge carries it.
    const complete = page.locator('article[data-sprint-card][data-state="complete"]');
    await expect(complete.first()).toBeVisible();
    await expect(complete.getByTestId('card-status-bar')).toHaveCount(0);

    await open(page, '/list?phase=3');
    const status = page.getByTestId('phase-status');
    await expect(status).toHaveText('Not started');
    await expect(status).toHaveAttribute('data-status', 'tag');
    // No run log: one dashed "Not run yet" row with every sprint, and the plain tag in the Sprints line.
    await expect(page.getByTestId('rail-summary')).toHaveText('No run log');
    await expect(page.locator('section[data-rail-row]')).toHaveCount(1);
    await expect(page.locator('section[data-rail-row="not-run"] article[data-sprint-card]')).toHaveCount(2);
  });
});

test.describe('375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal page scroll on the list view with a card open', async ({ page }) => {
    await open(page, '/list?phase=2');
    await expect(page.locator('main h1')).toBeVisible();
    await page.locator('article[data-sprint-card="2.1"]').getByTestId('card-toggle').click();
    await expect(page.locator('article[data-sprint-card="2.1"]').getByTestId('tasks-table')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
