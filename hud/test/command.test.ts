/**
 * `/phase-status`, through the loaded mod: answered by the mod's own
 * `command.run` hook, with no turn and so no model request.
 */
import { expect, test } from 'claude-code/testing';

import { formatTime } from '../hooks/hud.js';
import { PHASE_4_RETRIES, tsOf } from './fixtures.js';
import { PHASES, PHASE_4_LOG, ROOT, hud, phase4 } from './harness.js';

test('/phase-status reports the phase, sprint progress, current gate and last event', async ($, on) => {
  let turns = 0;
  on('turn.start', () => {
    turns++;
    throw new Error('/phase-status started a turn');
  });
  const h = phase4(on);
  await h.start($);
  expect(h.commands).toEqual(['phase-status']);

  await h.replay(PHASE_4_LOG, PHASE_4_RETRIES.slice(0, 3));
  const last = tsOf(PHASE_4_RETRIES[2]!);
  await h.clock.set(last + 3 * 60_000 + 20_000);

  const now = h.clock.now();
  const text = await h.phaseStatus($);
  expect(text).toBe(
    [
      'Phase 4 — Live Run',
      'Sprints: 4.1 2/2 · 4.2 0/3 (2/5 tasks)',
      'Now: wave 2 · 4.2 verify 2/3',
      // The time is in the machine's own zone, 12-hour.
      `Last event: ${formatTime(last, now, -new Date(now).getTimezoneOffset())}, 3 min ago`,
    ].join('\n'),
  );
  expect(text).toMatch(/^Last event: (?:\w{3} \d{1,2}, )?\d{1,2}:\d{2} [AP]M, 3 min ago$/m);
  expect(turns).toBe(0);
});

test('/phase-status says when the run has gone quiet', async ($, on) => {
  const h = phase4(on, Date.parse('2026-09-29T09:00:00Z'));
  await h.start($);

  const text = await h.phaseStatus($);
  expect(text).toContain('Now: wave 1 · 4.1 done (no event in the last 30 min)');
  expect(text).toContain('7 h 8 min ago');
});

test('/phase-status with no run log yet', async ($, on) => {
  const h = hud(on, Date.parse('2026-09-29T02:00:00Z'));
  h.write(`${PHASES}/Phase-4-Live-Run.md`, '# Phase 4 — Live Run\n');
  await h.start($);

  expect(await h.phaseStatus($)).toBe('Phase Runner: no run log in docs/phases/.runs/ yet.');
});

test('/phase-status with no docs/phases/', async ($, on) => {
  const h = hud(on, Date.parse('2026-09-29T02:00:00Z'));
  await h.start($);

  expect(await h.phaseStatus($)).toBe(`Phase Runner: no docs/phases/ folder in ${ROOT}.`);
});
