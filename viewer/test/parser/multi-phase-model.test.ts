import { describe, expect, it } from 'vitest';
import type { Dependency, Phase, Task, TaskStatus, VerificationConfig } from '../../src/core/model.js';
import { MULTI_PHASE } from '../fixtures/index.js';
import { parseFixture } from './helpers.js';

const [FILE_1, FILE_2, FILE_3] = MULTI_PHASE.phaseFiles as [string, string, string];

const STATUS: Record<string, TaskStatus> = {
  x: 'done',
  '~': 'active',
  '—': 'todo',
  BLOCKED: 'blocked',
  MANUAL: 'manual',
  CUT: 'cut',
  DEFERRED: 'deferred',
};

function task(
  rawStatus: string,
  number: number,
  text: string,
  module: string | null,
  reference: string | null,
  line: number,
): Task {
  return { number, text, status: STATUS[rawStatus]!, rawStatus, legacy: false, module, reference, line };
}

function criteria(...items: [string, number][]) {
  return items.map(([text, line]) => ({ text, checked: null, line }));
}

function dep(raw: string, line: number, sprints: string[] = [], phases: number[] = []): Dependency {
  return { raw, sprints, phases, none: false, line };
}

const NONE: Dependency[] = [{ raw: 'None', sprints: [], phases: [], none: true, line: 28 }];

function verification(line: number, fields: Partial<VerificationConfig> = {}): VerificationConfig {
  return { cli: 'npm run check', ui: [], skills: [], viewports: [], assert: [], extra: {}, line, ...fields };
}

const EMPTY_VERIFICATION: VerificationConfig = { ui: [], skills: [], viewports: [], assert: [], extra: {}, line: 0 };

const QA = 'visual-qa-testing';
const RESPONSIVE = 'responsive-testing';

const PHASE_1: Phase = {
  number: 1,
  title: 'Foundations',
  intro: "Set up the bookshelf app's data layer and the import pipeline. Every later phase reads from these tables.",
  file: FILE_1,
  line: 1,
  sprints: [
    {
      id: '1.1',
      phase: 1,
      number: 1,
      title: 'Schema',
      goal: 'Create the books and shelves tables with seed data.',
      tasks: [
        task('x', 1, 'Add `books` table (title, author, isbn, added_at)', 'db/migrations/', 'docs/spec.md#books', 17),
        task('x', 2, 'Add `shelves` table and the `shelf_books` join table', 'db/migrations/', null, 18),
        task('x', 3, 'Seed script with 20 sample books', 'scripts/seed.ts', null, 19),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(['Migrations apply cleanly on an empty database', 23], ['The seed script is idempotent', 24]),
      dependencies: NONE,
      verification: verification(30, { skipUi: true }),
      sections: [],
      line: 7,
      endLine: 35,
    },
    {
      id: '1.2',
      phase: 1,
      number: 2,
      title: 'Import Pipeline',
      goal: 'Import a Goodreads CSV export into the books table.',
      tasks: [
        task('x', 1, 'CSV parser for the Goodreads export format', 'src/import/csv.ts', 'docs/spec.md#import', 47),
        task('x', 2, 'Deduplicate by ISBN, then by title and author', 'src/import/dedupe.ts', null, 48),
        task('x', 3, 'Unit tests with a 500-row sample export', 'src/import/csv.test.ts', null, 49),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(['Importing the same file twice adds no duplicate rows', 53]),
      dependencies: [dep('Sprint 1.1 (books table must exist)', 57, ['1.1'])],
      verification: verification(59, { skipUi: true }),
      sections: [],
      line: 37,
      endLine: 64,
    },
  ],
  trailingSections: [
    { heading: 'Scope Guard', level: 2, body: 'No sync with Goodreads itself: the import is a one-off file upload.', line: 66 },
  ],
};

const PHASE_2: Phase = {
  number: 2,
  title: 'Library UI',
  intro:
    'The pages people use every day: the library grid, shelf pages and search.\n\nThis phase is in progress, so its sprints mix every task status.',
  file: FILE_2,
  line: 1,
  sprints: [
    {
      id: '2.1',
      phase: 2,
      number: 1,
      title: 'Library Grid',
      goal: 'Show every book as a cover grid with sort and filter.',
      tasks: [
        task('x', 1, 'Library page with a responsive cover grid', 'src/pages/library.tsx', 'docs/design/screens/library.md', 19),
        task('~', 2, 'Sort by title, author and date added', 'src/pages/library.tsx', null, 20),
        task('BLOCKED', 3, 'Cover images from Open Library (API key pending)', 'src/covers/openlibrary.ts', null, 21),
        task('—', 4, 'Empty state when the library has no books', 'src/pages/library.tsx', 'docs/design/screens/library.md', 22),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(
        ['The grid reflows from 2 to 6 columns between 375px and 1536px', 26],
        ['Sort order survives a page reload', 27],
      ),
      dependencies: [
        dep('Phase 1 (import pipeline fills the books table)', 31, [], [1]),
        dep('Sprint 1.2 (dedupe keeps the grid free of repeats)', 32, ['1.2']),
      ],
      verification: verification(34, {
        ui: ['/library'],
        skills: [QA, RESPONSIVE],
        viewports: [375, 768, 1280, 1536],
        assert: ['Grid shows every seeded book', 'No layout break at 375px'],
      }),
      sections: [],
      line: 9,
      endLine: 43,
    },
    {
      id: '2.2',
      phase: 2,
      number: 2,
      title: 'Shelves',
      goal: 'Let people group books into shelves.',
      tasks: [
        task('—', 1, 'Shelf page listing its books', 'src/pages/shelf.tsx', null, 55),
        task('—', 2, 'Add to shelf / remove from shelf actions', 'src/shelves/actions.ts', null, 56),
        task('CUT', 3, 'Drag books between shelves', 'src/pages/shelf.tsx', null, 57),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(['A book can sit on more than one shelf', 61]),
      dependencies: [dep('Sprint 2.1 (shelf pages reuse the grid)', 65, ['2.1'])],
      verification: EMPTY_VERIFICATION,
      sections: [],
      line: 45,
      endLine: 67,
    },
    {
      id: '2.3',
      phase: 2,
      number: 3,
      title: 'Search',
      goal: 'Search the library by title, author or ISBN.',
      tasks: [
        task('—', 1, 'Search box in the app header', 'src/components/SearchBox.tsx', null, 79),
        task('—', 2, 'Search results page', 'src/pages/search.tsx', 'docs/design/screens/search.md', 80),
        task('DEFERRED', 3, 'Fuzzy matching on author names', 'src/search/fuzzy.ts', null, 81),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(['Searching an exact ISBN returns that one book', 85]),
      dependencies: [dep('Sprint 2.1 (results use the grid)', 89, ['2.1']), dep('Sprint 1.2', 90, ['1.2'])],
      verification: verification(92, {
        ui: ['/search?q=dune', '/library'],
        skills: [QA],
        assert: ['Results update as you type'],
        extra: { timeout: '30' },
      }),
      sections: [],
      line: 69,
      endLine: 100,
    },
  ],
  trailingSections: [
    { heading: 'Scope Guard', level: 2, body: 'No recommendations and no social features in this phase.', line: 102 },
    {
      heading: 'Risk Mitigations',
      level: 2,
      body: '- Open Library rate limits: cache covers locally after the first fetch.\n- Large libraries: the grid virtualizes past 500 books.',
      line: 106,
    },
  ],
};

const PHASE_3: Phase = {
  number: 3,
  title: 'Sharing',
  intro: 'Public shelf links and a reading-stats page. Not started.',
  file: FILE_3,
  line: 1,
  sprints: [
    {
      id: '3.1',
      phase: 3,
      number: 1,
      title: 'Public Shelves',
      goal: 'Share a read-only link to one shelf.',
      tasks: [
        task('—', 1, 'Public shelf route with an unguessable slug', 'src/pages/public/shelf.tsx', null, 17),
        task('—', 2, 'Toggle to make a shelf public', 'src/shelves/actions.ts', null, 18),
        task('DEFERRED', 3, 'Open Graph preview image for shared links', 'src/og/shelf.ts', null, 19),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(["A private shelf's link returns 404", 23]),
      dependencies: [dep('Phase 2', 27, [], [2]), dep('Sprint 2.2 (shelves must exist)', 28, ['2.2'])],
      verification: verification(34, {
        ui: ['/s/example-slug'],
        skills: [QA],
        assert: ["Public page shows the shelf's books and no edit controls"],
      }),
      sections: [
        { heading: 'Notes', level: 3, body: 'The slug format is still open: nanoid(10) or a word list.', line: 30 },
      ],
      line: 7,
      endLine: 41,
    },
    {
      id: '3.2',
      phase: 3,
      number: 2,
      title: 'Reading Stats',
      goal: 'A stats page: books per month, pages per year.',
      tasks: [
        task('—', 1, 'Stats queries', 'src/stats/queries.ts', null, 53),
        task('—', 2, 'Stats page with two charts', 'src/pages/stats.tsx', 'docs/design/screens/stats.md', 54),
        task('MANUAL', 3, 'Manual check against a hand-counted month', null, null, 55),
      ],
      legacyTable: false,
      acceptanceCriteria: criteria(['Totals match a hand count for one sample month', 59]),
      dependencies: [dep('Sprint 3.1, Sprint 1.1', 63, ['3.1', '1.1'])],
      verification: verification(65, {
        ui: ['/stats'],
        skills: [QA, RESPONSIVE],
        assert: ['Both charts render with seeded data'],
      }),
      sections: [],
      line: 43,
      endLine: 70,
    },
  ],
  trailingSections: [],
};

describe('parsePhaseFile: multi-phase full model', () => {
  const [fx1, fx2, fx3] = MULTI_PHASE.phaseFiles.map(parseFixture);

  it('parses Phase 1 to the full expected model', () => {
    expect(fx1!.warnings).toEqual([]);
    expect(fx1!.phase).toEqual(PHASE_1);
  });

  it('parses Phase 2 to the full expected model', () => {
    expect(fx2!.warnings).toEqual([]);
    expect(fx2!.phase).toEqual(PHASE_2);
  });

  it('parses Phase 3 to the full expected model', () => {
    expect(fx3!.warnings).toEqual([]);
    expect(fx3!.phase).toEqual(PHASE_3);
  });

  it('resolves every dependency bullet to sprint and phase ids', () => {
    const deps = [fx1!, fx2!, fx3!].flatMap((fx) =>
      fx.phase.sprints.map((s) => [s.id, s.dependencies.flatMap((d) => d.sprints), s.dependencies.flatMap((d) => d.phases)]),
    );
    expect(deps).toEqual([
      ['1.1', [], []],
      ['1.2', ['1.1'], []],
      ['2.1', ['1.2'], [1]],
      ['2.2', ['2.1'], []],
      ['2.3', ['2.1', '1.2'], []],
      ['3.1', ['2.2'], [2]],
      ['3.2', ['3.1', '1.1'], []],
    ]);
  });

  it('gives a sprint with no Verification block an empty config and no warning', () => {
    const s22 = fx2!.phase.sprints[1]!;
    expect(s22.verification).toEqual(EMPTY_VERIFICATION);
    expect(s22.verification.cli).toBeUndefined();
    expect(s22.verification.skipUi).toBeUndefined();
    expect(fx2!.warnings).toEqual([]);
  });

  it('is plain JSON', () => {
    for (const fx of [fx1!, fx2!, fx3!]) expect(JSON.parse(JSON.stringify(fx.phase))).toEqual(fx.phase);
  });
});
