/**
 * Test fixtures. A test can't read files, so they live here as strings.
 *
 * The run-log lines come from this repo's own build of phase-viewer
 * (`docs/phases/.runs/` in the project folder, which is not in the repo).
 * {@link PHASE_4_RETRIES} and {@link PHASE_7_BLOCKED} are copied as logged.
 * The other lines keep their fields and timestamps, with long summaries and
 * `files` lists shortened.
 */

/** A small phase file in the shape phase-planner writes: one finished sprint, one not started. */
export const PHASE_4_PLAN = `# Phase 4 — Live Run

The live view of a running phase.

---

# Sprint 4.1 — Client Scaffold

### Goal

Stand up the client and its browser test harness.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| x | 1 | Vite and React scaffold | src/client/ |
| x | 2 | Playwright harness | tests/e2e/ |

### Acceptance Criteria

- The dev server starts and serves the client

### Dependencies

- None

### Verification

- cli: npm run check
- ui: /

---

# Sprint 4.2 — App Shell

### Goal

The shell every page sits in.

### Tasks

| Status | # | Task | Module | Reference |
|--------|---|------|--------|-----------|
| — | 1 | Router and layout | src/client/App.tsx |
| — | 2 | Sidebar with sprint rows | src/client/rail/ |
| CUT | 3 | Status legend | src/client/rail/ |
| MANUAL | 4 | Record the demo |

### Acceptance Criteria

- No horizontal page scroll at 375 px

### Dependencies

- Sprint 4.1

### Verification

- cli: npm run check
- ui: /, /phase/1
`;

/** Wave 1 of Phase 4: Sprint 4.1 through every gate. */
export const PHASE_4_WAVE_1: readonly string[] = [
  '{"v":1,"ts":"2026-09-29T01:44:12Z","phase":4,"wave":1,"sprint":"4.1","gate":"implement","result":"pass","attempt":1,"max":3,"summary":"done 1,2,3,4,5 — Vite 8, React 19, Playwright 1.63"}',
  '{"v":1,"ts":"2026-09-29T01:45:42Z","phase":4,"wave":1,"sprint":"4.1","gate":"verify","result":"pass","attempt":1,"max":3,"summary":"criteria 3/3 met"}',
  '{"v":1,"ts":"2026-09-29T01:50:05Z","phase":4,"wave":1,"sprint":"4.1","gate":"wave_test","result":"pass","attempt":1,"max":3,"summary":"1 URL, 5 viewports"}',
  '{"v":1,"ts":"2026-09-29T01:51:24Z","phase":4,"wave":1,"sprint":"4.1","gate":"doc_sync","result":"pass","attempt":1,"max":1,"summary":"5 tasks updated","files":["package.json","playwright.config.ts"]}',
];

/**
 * Wave 2 of Phase 4 as it really went: Sprint 4.2 fails verify twice and
 * passes on the third attempt. Never an escalation.
 */
export const PHASE_4_RETRIES: readonly string[] = [
  '{"v":1,"ts":"2026-09-29T02:02:20Z","phase":4,"wave":2,"sprint":"4.2","gate":"implement","result":"pass","attempt":1,"max":3,"summary":"done 1,2,3,4,5,6 — status legend omitted per design-system hard rule; hand-written router; loading copy without N; shell.spec.ts uses tests/e2e/harness.ts on ports 4794-4799"}',
  '{"v":1,"ts":"2026-09-29T02:03:59Z","phase":4,"wave":2,"sprint":"4.2","gate":"verify","result":"fail","attempt":1,"max":3,"summary":"npm run check fails - shell.spec.ts uses window/document in page.evaluate but tsconfig lib is ES2022 (no DOM); TS2304/TS2584 at lines 19,24,155; test:e2e never ran"}',
  '{"v":1,"ts":"2026-09-29T02:05:42Z","phase":4,"wave":2,"sprint":"4.2","gate":"implement","result":"pass","attempt":2,"max":3,"summary":"retry 1: page.evaluate callbacks use globalThis casts instead of window/document; harness.ts const hardening"}',
  '{"v":1,"ts":"2026-09-29T02:08:15Z","phase":4,"wave":2,"sprint":"4.2","gate":"verify","result":"fail","attempt":2,"max":3,"summary":"criterion /\'No horizontal page scroll at 375 px/\' NOT_MET - shell.spec.ts 375px suite fails on all 4 routes with 168px document overflow at 375x812"}',
  '{"v":1,"ts":"2026-09-29T02:10:23Z","phase":4,"wave":2,"sprint":"4.2","gate":"implement","result":"pass","attempt":3,"max":3,"summary":"retry 2: contained visually-hidden sidebar status text (position relative on .sprints) to fix 375px overflow; SprintPage uses data-sprint-id; sidebarRow() test helper"}',
  '{"v":1,"ts":"2026-09-29T02:11:06Z","phase":4,"wave":2,"sprint":"4.2","gate":"verify","result":"pass","attempt":3,"max":3,"summary":"criteria 3/3 met"}',
];

/** The rest of wave 2: the browser test, then doc-sync, which ends the phase in {@link PHASE_4_PLAN}. */
export const PHASE_4_WAVE_2_END: readonly string[] = [
  '{"v":1,"ts":"2026-09-29T02:17:16Z","phase":4,"wave":2,"sprint":"4.2","gate":"wave_test","result":"pass","attempt":1,"max":3,"summary":"3 URLs, 4 viewports"}',
  '{"v":1,"ts":"2026-09-29T02:18:47Z","phase":4,"wave":2,"sprint":"4.2","gate":"doc_sync","result":"pass","attempt":1,"max":1,"summary":"6 tasks updated","files":["src/client/App.tsx"]}',
];

/** Phase 7, wave 5: the implementer of Sprint 7.5 reports a blocked task. */
export const PHASE_7_BLOCKED =
  '{"v":1,"ts":"2026-09-29T08:39:41Z","phase":7,"wave":5,"sprint":"7.5","gate":"implement","result":"blocked","attempt":1,"max":3,"summary":"done 1,2,3; blocked 4 — Implementers append implement start lines; task 4 install + phase run needs the user"}';

/** The `ts` of a run-log line, in milliseconds since the epoch. */
export function tsOf(line: string): number {
  return Date.parse((JSON.parse(line) as { ts: string }).ts);
}
