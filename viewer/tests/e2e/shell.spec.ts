/**
 * The unified shell's own states (design-system.md "Loading", "Connection
 * lost", "Unified states"): the loading block before the first snapshot, and
 * the connection-lost banner while the server is away. The kanban, filter
 * row, panel, list view and their 375 px layouts are in `board.spec.ts`.
 *
 * The loading test holds back the event stream on the shared `webServer`.
 * The connection test needs a server that stops and returns, so it starts
 * its own dev loop with `startHarness` on ports clear of the shared one
 * (4798 / 4799).
 */
import { expect, test } from '@playwright/test';
import { startHarness } from './harness.js';

/** The phase the trail-log fixture's newest run-log events belong to. */
const ACTIVE_PHASE = 'Phase 2: Trip Journal';

test.describe('loading', () => {
  test('the loading block shows under the filter row until the first snapshot arrives', async ({ page }) => {
    // Refuse the event stream so no snapshot can arrive.
    await page.route('**/api/events', (route) => route.abort());
    await page.goto('/');

    const loading = page.getByTestId('loading');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading.locator('h3')).toHaveText('Loading');
    await expect(loading.locator('p')).toHaveText('Reading phase files');
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'connecting');
    // The shell is up around it; nothing else claims the page yet.
    await expect(page.locator('.app-head')).toBeVisible();
    const row = await page.getByTestId('filter-row').boundingBox();
    const shown = await loading.boundingBox();
    expect(row && shown && shown.y >= row.y + row.height).toBe(true);
    // Never connected, so nothing says the connection was lost.
    await expect(page.getByTestId('connection-lost')).toHaveCount(0);
    await expect(page.getByTestId('kanban')).toHaveCount(0);

    // Let the stream through: the next reconnect brings the snapshot and the kanban replaces the block.
    await page.unroute('**/api/events');
    await expect(page.getByTestId('kanban')).toBeVisible({ timeout: 15_000 });
    await expect(loading).toHaveCount(0);
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'live');
  });
});

test.describe('connection lost', () => {
  test('the banner shows only while the server is down and the last view stays', async ({ page }) => {
    test.setTimeout(90_000);
    const harness = await startHarness({ clientPort: 4798, serverPort: 4799, freshness: 'fresh' });
    try {
      // The kanban, and the panel of the active phase.
      await page.goto(`${harness.baseURL}/`);
      await expect(page.locator('.app')).toHaveAttribute('data-connection', 'live');
      const columns = page.locator('a[data-kan-col]');
      await expect(columns).toHaveCount(3);
      await expect(columns.nth(1)).toHaveAccessibleName(ACTIVE_PHASE);

      // Connected: nothing connection-related on screen.
      const banner = page.getByTestId('connection-lost');
      await expect(banner).toHaveCount(0);
      await expect(page.getByText(/connection|reconnect/i)).toHaveCount(0);

      await harness.stopServer();
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toContainText('Lost connection to the viewer server.');
      await expect(banner).toContainText(/Showing the last update from \d{1,2}:\d{2} (AM|PM)\./);
      await expect(page.locator('.app')).toHaveAttribute('data-connection', 'reconnecting');
      // The last snapshot stays on screen, the banner under the filter row.
      await expect(columns).toHaveCount(3);
      await expect(page.locator('li[data-tile]')).toHaveCount(8);
      const row = await page.getByTestId('filter-row').boundingBox();
      const shown = await banner.boundingBox();
      expect(row && shown && shown.y >= row.y + row.height).toBe(true);
      // An open panel shows it too.
      await columns.nth(1).click();
      await expect(page.getByTestId('slide-panel').getByTestId('connection-lost')).toBeVisible();

      await harness.startServer();
      await expect(banner).toHaveCount(0, { timeout: 30_000 });
      await expect(page.locator('.app')).toHaveAttribute('data-connection', 'live');
      await expect(page.getByTestId('slide-panel').getByTestId('phase-rail')).toHaveAttribute('data-phase', '2');
    } finally {
      await harness.close();
    }
  });
});
