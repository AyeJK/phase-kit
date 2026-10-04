/**
 * Smoke test: the client loads against the dev fixture, connects to the
 * event stream and shows the shell with the project, with no console errors.
 *
 * The top bar carries no project name (design-system.md "Unified top bar"),
 * so the project shows in the document title ("Phases · trail-log") and
 * through its phases in the list view, which a first visit opens.
 */
import { expect, test } from '@playwright/test';

/** The dev fixture's folder name, which the viewer shows as the project name. */
const PROJECT_NAME = 'trail-log';

test('app loads and shows the project with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.locator('.app')).toHaveAttribute('data-connection', 'live');
  await expect(page).toHaveTitle(new RegExp(`· ${PROJECT_NAME}$`));
  await expect(page.getByRole('img', { name: 'Phase Runner' })).toBeVisible();
  await expect(page.locator('a[data-phase-item]').first()).toHaveAccessibleName(/^Phase \d+/);
  expect(errors).toEqual([]);
});
