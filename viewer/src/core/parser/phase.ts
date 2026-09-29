/**
 * Phase-file parser: `docs/phases/Phase-{N}-{Name}.md` text in, one typed
 * {@link Phase} out. Pure (no fs) and never throws.
 *
 * Parsing runs in two passes:
 *
 * 1. {@link splitPhaseFile} walks the lines once and cuts the file into
 *    blocks: the `# Phase` header, the intro, one {@link SprintBlock} per
 *    `# Sprint N.M — Title` header (itself split into `###` {@link RawSection}s),
 *    and the `##` sections after the sprints. Headings inside fenced code
 *    blocks are ignored.
 * 2. Each sprint's sections are handed to the parser registered for their
 *    heading in {@link SPRINT_SECTION_PARSERS} (`Goal`, `Tasks`,
 *    `Acceptance Criteria`, `Dependencies`, `Verification`). A section with no
 *    registered parser (`### Notes`, anything else) is kept raw in
 *    {@link Sprint.sections}, never warned about. `##` sections after the
 *    sprints (`Scope Guard`, `Risk Mitigations`, anything else) are kept raw
 *    in {@link Phase.trailingSections}.
 *
 * Warning policy (each warning carries the file, the 1-based line and the raw
 * line text):
 *
 * - no `# Phase` header (line 0), or a `# Phase` header without a number
 * - a `# Sprint` header without an `N.M` id: one warning on the header; the
 *   whole block up to the next sprint header or `##` section is skipped
 * - a sprint without a `### Goal` section (on the sprint header)
 * - a second section of a kind already parsed in the sprint (e.g. two
 *   `### Tasks`): only the first is parsed; the repeat is kept raw in
 *   {@link Sprint.sections}
 * - a line holding control characters or invalid UTF-8 (anywhere in the file)
 * - task-table problems, from {@link parseTaskTable}: a row with no closing
 *   pipe, text directly after the table, an unrecognized status, extra cells
 * - verification problems, from {@link parseVerification}: a line that isn't
 *   `key: value`, a known key with no value, a non-numeric viewport, a
 *   `skip-ui` that isn't a boolean
 * - an unexpected exception: caught, reported, and whatever parsed so far returned
 *
 * Acceptance criteria and dependencies never warn. Dependency ids that name
 * no real sprint or phase are left for `loadProject` to warn about.
 */
import type { Phase, Section, Sprint, Warning } from '../model.js';
import { hasJunkBytes, isBlank, isDivider, joinLines, splitLines, trimBlock, warningAt, type SourceLine } from './lines.js';
import { parseAcceptanceCriteria, parseDependencies } from './sections.js';
import { parseTaskTable } from './tasks.js';
import { emptyVerification, parseVerification } from './verification.js';

/** What {@link parsePhaseFile} returns. */
export interface PhaseFileResult {
  /** The parsed phase. Always present, even for garbage input. */
  phase: Phase;
  /** Problems found, sorted by line. */
  warnings: Warning[];
}

/** A heading and the lines under it, up to the next heading of the same or higher level. */
export interface RawSection {
  /** Heading text without the `#` marks, trimmed. */
  heading: string;
  /** Number of `#` marks. */
  level: number;
  /** The heading line itself. */
  header: SourceLine;
  /** Every line after the heading, untrimmed (use {@link trimBlock} for the content). */
  body: SourceLine[];
}

/** One `# Sprint N.M — Title` block, cut into its `###` sections. */
export interface SprintBlock {
  /** The `# Sprint` header line. */
  header: SourceLine;
  /** Sprint id as written, e.g. `"2.1"`. */
  id: string;
  /** Phase number (before the dot). */
  phase: number;
  /** Sprint number (after the dot). */
  number: number;
  /** Title after the separator, trimmed. */
  title: string;
  /** Lines between the header and the first `###` heading. */
  preamble: SourceLine[];
  /** `###` sections in file order. */
  sections: RawSection[];
  /** 1-based line of the sprint's last non-blank line (a closing `---` counts). */
  endLine: number;
}

/** A phase file cut into blocks by {@link splitPhaseFile}. */
export interface PhaseBlocks {
  /** The `# Phase` header line, or `null` when the file has none. */
  header: SourceLine | null;
  /** Lines between the phase header and the first sprint. */
  intro: SourceLine[];
  /** Sprints with a valid `N.M` id, in file order. */
  sprints: SprintBlock[];
  /** `##` sections that come after a sprint, in file order. */
  trailing: RawSection[];
}

/** Shared state handed to each sprint-section parser. */
export interface SprintParseContext {
  /** File path for warnings. */
  file: string;
  /** Warnings sink. */
  warnings: Warning[];
  /** Parsers already applied in this sprint (the first section of each kind wins). */
  seen: Set<SprintSectionParser>;
}

/**
 * Fills part of a {@link Sprint} from one of its `###` sections. Registered in
 * {@link SPRINT_SECTION_PARSERS} under the section's key (see {@link sectionKey}).
 */
export type SprintSectionParser = (section: RawSection, sprint: Sprint, ctx: SprintParseContext) => void;

/** Normalize a heading into a lookup key: markdown emphasis and a trailing colon dropped, lowercased. */
export function sectionKey(heading: string): string {
  return heading
    .replace(/[*_`]/g, '')
    .trim()
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
}

/** Trimmed text content of a section. */
export function sectionText(section: RawSection): string {
  return joinLines(trimBlock(section.body)).trim();
}

const parseGoal: SprintSectionParser = (section, sprint) => {
  sprint.goal = sectionText(section);
};

const parseTasks: SprintSectionParser = (section, sprint, ctx) => {
  const result = parseTaskTable(section.body, ctx.file);
  sprint.tasks = result.value.tasks;
  sprint.legacyTable = result.value.legacyTable;
  ctx.warnings.push(...result.warnings);
};

const parseCriteria: SprintSectionParser = (section, sprint) => {
  sprint.acceptanceCriteria = parseAcceptanceCriteria(section.body);
};

const parseDeps: SprintSectionParser = (section, sprint) => {
  sprint.dependencies = parseDependencies(section.body);
};

const parseVerificationSection: SprintSectionParser = (section, sprint, ctx) => {
  const result = parseVerification(section.body, section.header.line, ctx.file);
  sprint.verification = result.value;
  ctx.warnings.push(...result.warnings);
};

/**
 * Section parsers by {@link sectionKey}. Only the first section of each kind
 * in a sprint is parsed. Sections with no entry here are kept raw in
 * {@link Sprint.sections} without a warning.
 */
export const SPRINT_SECTION_PARSERS = new Map<string, SprintSectionParser>([
  ['goal', parseGoal],
  ['tasks', parseTasks],
  ['task', parseTasks],
  ['acceptance criteria', parseCriteria],
  ['acceptance', parseCriteria],
  ['dependencies', parseDeps],
  ['dependency', parseDeps],
  ['depends on', parseDeps],
  ['verification', parseVerificationSection],
]);

/** A section kept as raw markdown: heading, level, trimmed body and heading line. */
export function rawSection(section: RawSection): Section {
  return { heading: section.heading, level: section.level, body: sectionText(section), line: section.header.line };
}

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const PHASE_START = /^#\s+Phase\b/i;
const PHASE_HEADER = /^#\s+Phase\s+(\d+)(?:\s*[—–:-]\s*|\s+|$)(.*)$/i;
/** Level-1 `# Sprint …` is always meant as a sprint header; level-2 only when a number follows. */
const SPRINT_START = /^(?:#\s+Sprint\b|##\s+Sprint\s+\d)/i;
const SPRINT_HEADER = /^#{1,2}\s+Sprint\s+(\d+)\.(\d+)(?:\s*[—–:-]\s*|\s+|$)(.*)$/i;

/** Phase number from a `Phase-{N}-…` file name, or `0`. */
function numberFromFileName(file: string): number {
  const base = file.split(/[\\/]/).pop() ?? '';
  const m = /^Phase-(\d+)/i.exec(base);
  return m ? Number(m[1]) : 0;
}

/**
 * Cut a phase file's lines into blocks. Warns (into `warnings`) about sprint
 * headers without an `N.M` id; everything else is left to the block parsers.
 */
export function splitPhaseFile(lines: SourceLine[], file: string, warnings: Warning[]): PhaseBlocks {
  const blocks: PhaseBlocks = { header: null, intro: [], sprints: [], trailing: [] };
  let state: 'intro' | 'sprint' | 'skip' | 'trailing' = 'intro';
  let sprint: SprintBlock | null = null;
  let section: RawSection | null = null;
  let fence: string | null = null;

  for (const line of lines) {
    let heading: RegExpExecArray | null = null;
    const fenceMark = FENCE.exec(line.text)?.[1];
    if (fence !== null) {
      if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = null;
    } else if (fenceMark) {
      fence = fenceMark;
    } else {
      heading = HEADING.exec(line.text);
    }

    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2] ?? '';

      if (level <= 2 && SPRINT_START.test(line.text)) {
        sprint = null;
        section = null;
        const m = SPRINT_HEADER.exec(line.text);
        if (m) {
          const block: SprintBlock = {
            header: line,
            id: `${m[1]}.${m[2]}`,
            phase: Number(m[1]),
            number: Number(m[2]),
            title: (m[3] ?? '').trim(),
            preamble: [],
            sections: [],
            endLine: line.line,
          };
          blocks.sprints.push(block);
          sprint = block;
          state = 'sprint';
        } else {
          warnings.push(warningAt(file, line, 'Sprint header has no N.M id; the sprint and its tasks are skipped'));
          state = 'skip';
        }
        continue;
      }

      if (level === 1 && state === 'intro' && blocks.header === null && PHASE_START.test(line.text)) {
        blocks.header = line;
        blocks.intro = [];
        continue;
      }

      if (level === 2 && state !== 'intro') {
        sprint = null;
        const trailing: RawSection = { heading: text, level, header: line, body: [] };
        blocks.trailing.push(trailing);
        section = trailing;
        state = 'trailing';
        continue;
      }

      if (level === 3 && state === 'sprint' && sprint !== null) {
        const current: SprintBlock = sprint;
        const sub: RawSection = { heading: text, level, header: line, body: [] };
        current.sections.push(sub);
        current.endLine = line.line;
        section = sub;
        continue;
      }
    }

    switch (state) {
      case 'intro':
        blocks.intro.push(line);
        break;
      case 'sprint':
        if (sprint !== null) {
          const current: SprintBlock = sprint;
          const target: RawSection | null = section;
          if (target) target.body.push(line);
          else current.preamble.push(line);
          if (!isBlank(line)) current.endLine = line.line;
        }
        break;
      case 'trailing': {
        const target: RawSection | null = section;
        if (target) target.body.push(line);
        break;
      }
      case 'skip':
        break;
    }
  }

  return blocks;
}

function emptySprint(block: SprintBlock): Sprint {
  return {
    id: block.id,
    phase: block.phase,
    number: block.number,
    title: block.title,
    goal: null,
    tasks: [],
    legacyTable: false,
    acceptanceCriteria: [],
    dependencies: [],
    verification: emptyVerification(),
    sections: [],
    line: block.header.line,
    endLine: block.endLine,
  };
}

function errorMessage(err: unknown): string {
  try {
    return err instanceof Error ? err.message : String(err);
  } catch {
    return 'unknown error';
  }
}

/**
 * Parse one phase file. Never throws: any unexpected error becomes a warning
 * and the phase parsed so far is returned.
 *
 * @param text The file's contents (LF or CRLF).
 * @param file The file's path, used for warnings, {@link Phase.file}, and as
 *   the phase-number fallback when the header has none.
 */
export function parsePhaseFile(text: string, file: string): PhaseFileResult {
  const warnings: Warning[] = [];
  const phase: Phase = { number: 0, title: '', intro: '', file: '', sprints: [], trailingSections: [], line: 0 };
  const cursor: { file: string; at: SourceLine | null } = { file: '', at: null };

  try {
    // Guard against non-string input from untyped callers.
    const rawFile: unknown = file;
    const rawText: unknown = text;
    cursor.file = typeof rawFile === 'string' ? rawFile : String(rawFile ?? '');
    phase.file = cursor.file;
    phase.number = numberFromFileName(cursor.file);

    const source = typeof rawText === 'string' ? rawText : String(rawText ?? '');
    const lines = splitLines(source);

    for (const line of lines) {
      if (hasJunkBytes(line)) {
        warnings.push(warningAt(cursor.file, line, 'Line contains stray control characters or invalid UTF-8'));
      }
    }

    const blocks = splitPhaseFile(lines, cursor.file, warnings);

    // Phase header and intro.
    if (blocks.header) {
      const header = blocks.header;
      cursor.at = header;
      phase.line = header.line;
      const m = PHASE_HEADER.exec(header.text);
      if (m) {
        phase.number = Number(m[1]);
        phase.title = (m[2] ?? '').trim();
      } else {
        phase.title = header.text.replace(PHASE_START, '').replace(/^\s*[—–:-]?\s*/, '').trim();
        warnings.push(warningAt(cursor.file, header, 'Phase header has no number; phase number taken from the file name'));
      }
    } else {
      warnings.push(
        warningAt(cursor.file, null, 'No "# Phase N — Title" header; phase number taken from the file name'),
      );
    }
    phase.intro = joinLines(trimBlock(blocks.intro.filter((l) => !isDivider(l))))
      .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
      .trim();

    // Sprints.
    for (const block of blocks.sprints) {
      const sprint = emptySprint(block);
      phase.sprints.push(sprint);
      const ctx: SprintParseContext = { file: cursor.file, warnings, seen: new Set() };
      try {
        for (const section of block.sections) {
          cursor.at = section.header;
          const parse = SPRINT_SECTION_PARSERS.get(sectionKey(section.heading));
          if (!parse) {
            // Unregistered section (Notes, …): kept raw, no warning.
            sprint.sections.push(rawSection(section));
            continue;
          }
          if (ctx.seen.has(parse)) {
            warnings.push(
              warningAt(
                cursor.file,
                section.header,
                `Repeated "### ${section.heading}" section in sprint ${block.id}; only the first is parsed, this one is kept as a raw section`,
              ),
            );
            sprint.sections.push(rawSection(section));
            continue;
          }
          ctx.seen.add(parse);
          parse(section, sprint, ctx);
        }
        if (sprint.goal === null) {
          warnings.push(warningAt(cursor.file, block.header, 'Sprint has no ### Goal section'));
        }
      } catch (err) {
        warnings.push(
          warningAt(
            cursor.file,
            cursor.at ?? block.header,
            `Parser error in sprint ${block.id}: ${errorMessage(err)}; keeping what was parsed so far`,
          ),
        );
      }
    }

    // `##` sections after the sprints.
    for (const section of blocks.trailing) {
      cursor.at = section.header;
      phase.trailingSections.push(rawSection(section));
    }
  } catch (err) {
    warnings.push(
      warningAt(cursor.file, cursor.at, `Parser error: ${errorMessage(err)}; returning what was parsed so far`),
    );
  }

  warnings.sort((a, b) => a.line - b.line);
  return { phase, warnings };
}
