import { describe, expect, it } from 'vitest';
import type { Phase, Task } from '../../src/core/model.js';
import { SAMPLE_PROJECT } from '../fixtures/index.js';
import { allTasks, parseFixture } from './helpers.js';

const FILE = SAMPLE_PROJECT.phaseFiles[0]!;

const done = (number: number, text: string, module: string, reference: string | null, line: number): Task => ({
  number,
  text,
  status: 'done',
  rawStatus: 'x',
  legacy: false,
  module,
  reference,
  line,
});

const SETTINGS_PAGE = 'src/pages/settings/notifications.tsx';
const SETTINGS_SPEC = 'docs/design/screens/notification-settings.md';

/** The whole expected model for sample-project. */
const EXPECTED: Phase = {
  number: 1,
  title: 'Notifications',
  intro:
    'Add in-app and email notifications for task assignment and due-date reminders. This phase covers the data layer, the notification-sending logic, and the settings UI where users control what they receive.',
  file: FILE,
  line: 1,
  trailingSections: [
    {
      heading: 'Scope Guard',
      level: 2,
      body: "This phase does not include push notifications (mobile) or a notification history/inbox view — both deferred to a later phase pending user research on whether they're wanted.",
      line: 71,
    },
  ],
  sprints: [
    {
      id: '1.1',
      phase: 1,
      number: 1,
      title: 'Notification Schema and Queue',
      goal: 'Add the notification data model and a durable send queue, with no UI yet.',
      tasks: [
        done(1, 'Add `notifications` table (recipient, type, payload, sent_at, read_at)', 'db/migrations/', null, 17),
        done(2, 'Add `notification_preferences` table (user_id, channel, event_type, enabled)', 'db/migrations/', null, 18),
        done(3, 'Queue worker that reads pending notifications and dispatches by channel', 'src/notifications/queue.ts', null, 19),
        done(4, 'Unit tests for queue dispatch logic', 'src/notifications/queue.test.ts', null, 20),
      ],
      legacyTable: false,
      acceptanceCriteria: [
        {
          text: 'A row inserted into `notifications` with `sent_at IS NULL` is picked up and sent within one queue tick',
          checked: null,
          line: 24,
        },
        {
          text: 'Disabled preferences are respected — no send attempted for a disabled channel/event combo',
          checked: null,
          line: 25,
        },
      ],
      dependencies: [{ raw: 'None', sprints: [], phases: [], none: true, line: 29 }],
      verification: {
        cli: 'npm run check',
        ui: [],
        skills: [],
        viewports: [],
        skipUi: true,
        assert: [],
        extra: {},
        line: 31,
      },
      sections: [],
      line: 7,
      endLine: 36,
    },
    {
      id: '1.2',
      phase: 1,
      number: 2,
      title: 'Notification Settings UI',
      goal: 'Let users see and edit their notification preferences.',
      tasks: [
        done(1, 'Settings page section listing all event types with per-channel toggles', SETTINGS_PAGE, SETTINGS_SPEC, 48),
        done(2, 'Save preferences on toggle, optimistic UI update', SETTINGS_PAGE, SETTINGS_SPEC, 49),
        done(3, 'Empty/loading/error states per screen spec', SETTINGS_PAGE, SETTINGS_SPEC, 50),
      ],
      legacyTable: false,
      acceptanceCriteria: [
        { text: 'Toggling a channel off persists immediately and survives a page reload', checked: null, line: 54 },
        { text: 'Page matches `docs/design/screens/notification-settings.md` states matrix', checked: null, line: 55 },
      ],
      dependencies: [
        { raw: 'Sprint 1.1 (preferences table must exist)', sprints: ['1.1'], phases: [], none: false, line: 59 },
      ],
      verification: {
        cli: 'npm run check',
        ui: ['/settings/notifications'],
        skills: ['visual-qa-testing', 'responsive-testing'],
        viewports: [375, 768, 1280],
        assert: ['All event types listed; toggles reflect saved state after reload; no layout break at 375px'],
        extra: {},
        line: 61,
      },
      sections: [],
      line: 38,
      endLine: 69,
    },
  ],
};

describe('parsePhaseFile: sample-project', () => {
  const fx = parseFixture(FILE);

  it('parses to 1 phase, 2 sprints, 7 tasks, all done, 0 warnings', () => {
    expect(fx.warnings).toEqual([]);
    expect(fx.phase.sprints).toHaveLength(2);
    const tasks = allTasks(fx.phase);
    expect(tasks).toHaveLength(7);
    expect(tasks.every((t) => t.status === 'done')).toBe(true);
  });

  it('matches the full expected model', () => {
    expect(fx.phase).toEqual(EXPECTED);
  });

  it('parses Sprint 1.2 verification: one route, three viewports, two skills, one assert', () => {
    const v = fx.phase.sprints[1]!.verification;
    expect(v.ui).toEqual(['/settings/notifications']);
    expect(v.viewports).toEqual([375, 768, 1280]);
    expect(v.skills).toHaveLength(2);
    expect(v.assert).toHaveLength(1);
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(fx.phase))).toEqual(fx.phase);
  });
});
