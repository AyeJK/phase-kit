/**
 * End-to-end tests (`npm run test:e2e`), against the dev loop: Playwright
 * starts `npm run dev` (Vite + the viewer server on a temp copy of the
 * `trail-log` fixture, with the simulated run playing) on ports of its own,
 * so it never collides with a dev session on the default 5173 / 4747.
 *
 * Outside CI an already running server on the test port is reused, which
 * keeps a local edit-and-rerun loop fast; stop it to get a fresh simulated
 * run.
 */
import { defineConfig, devices } from '@playwright/test';

/** Vite (the page Playwright opens). */
export const E2E_CLIENT_PORT = 4790;
/** First port the viewer server tries (it falls through to the next free one). */
export const E2E_SERVER_PORT = 4791;

const baseURL = `http://127.0.0.1:${E2E_CLIENT_PORT}`;
const ci = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --client-port ${E2E_CLIENT_PORT} --server-port ${E2E_SERVER_PORT} --interval 1500 --start-delay 3000`,
    // Through the Vite proxy, so it answers only once both servers are up.
    url: `${baseURL}/api/health`,
    reuseExistingServer: !ci,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
