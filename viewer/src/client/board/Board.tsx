/**
 * The phase kanban, home at `/` (design-system.md "Phase kanban", "Slide-in
 * panel"): one equal-width column per phase that passes the filter, and the
 * slide-in panel for `?phase=N`.
 *
 * - Columns share the board's tracks: there's one track per phase whatever
 *   the filter, so hiding columns never resizes the others. Tracks are at
 *   least 180px; when the phases don't fit, the board scrolls sideways
 *   inside itself, never the page.
 * - Clicking a column pushes `/?phase=N` (marked in `history.state`) and the
 *   panel slides in. Closing (back arrow, scrim, Escape) goes Back when the
 *   board opened the panel, so the browser's Back and Forward stay in step;
 *   a panel reached by a link (`/?phase=N` typed or shared) is closed by
 *   replacing the entry with `/`. The browser's Back closes it too.
 * - When the panel closes, focus returns to the column that opened it.
 * - Warnings on files that belong to no phase show as banners above the
 *   board; a phase's own warnings show as a tag on its column and as banners
 *   in its panel.
 *
 * Test hooks: `kanban`, `kan-board`, `board-empty`, plus the column's and
 * the panel's.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Project } from '../../core/model.js';
import type { PhaseFilter } from '../rail/derive.js';
import { paths, useRouter } from '../shell/router.js';
import { ParseWarnings } from '../states/ParseWarnings.js';
import { phaseFiles, samePath } from '../states/warnings.js';
import { EMPTY_FILTER_TEXT, kanbanColumns, matchesFilter } from './derive.js';
import { KanbanColumn, PANEL_ENTRY } from './KanbanColumn.js';
import { SlidePanel } from './SlidePanel.js';
import './board.css';

interface BoardProps {
  project: Project;
  /** The phase whose panel is open, or `null`. */
  phase: number | null;
  show: PhaseFilter;
  /** App-wide banners (connection lost), repeated inside the panel. */
  banner?: ReactNode;
}

/** How long the panel takes to slide (`--slide` in tokens.css). */
const SLIDE_MS = 280;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The panel's phase while it's open, and for the length of the slide after
 * it closes (`closing`), so it can slide out. Reduced motion drops it at once.
 */
function useSlide(open: number | null): { phase: number | null; closing: boolean } {
  const [shown, setShown] = useState<number | null>(open);
  if (open !== null && shown !== open) setShown(open);

  useEffect(() => {
    if (open !== null) return;
    if (reducedMotion()) {
      setShown(null);
      return;
    }
    const timer = window.setTimeout(() => setShown(null), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { phase: open ?? shown, closing: open === null && shown !== null };
}

export function Board({ project, phase, show, banner }: BoardProps) {
  const { navigate } = useRouter();
  const columns = useMemo(() => kanbanColumns(project), [project]);
  const visible = columns.filter((c) => matchesFilter(c.group, show));
  const slide = useSlide(phase);

  // Files with warnings that no phase owns (a phase's own show in its column and panel).
  const orphanFiles = useMemo(() => {
    const owned = new Set(project.phases.flatMap((p) => phaseFiles(project, p)).map(samePath));
    return [...new Set(project.warnings.map((w) => w.file))].filter((f) => !owned.has(samePath(f)));
  }, [project]);

  const close = useCallback(() => {
    const state = window.history.state as typeof PANEL_ENTRY | null;
    if (state?.panel) window.history.back();
    else navigate(paths.board({ show }), { replace: true, scroll: false });
  }, [navigate, show]);

  // Focus goes back to the column that opened the panel.
  const opened = useRef<number | null>(phase);
  useEffect(() => {
    if (phase !== null) {
      opened.current = phase;
      return;
    }
    const n = opened.current;
    opened.current = null;
    if (n !== null) document.querySelector<HTMLElement>(`[data-kan-col="${n}"]`)?.focus();
  }, [phase]);

  const board = { '--cols': Math.max(columns.length, 1) } as CSSProperties;

  return (
    <>
      <main className="kanban" id="main" inert={phase !== null} data-testid="kanban">
        <h1 className="visually-hidden">Phases</h1>
        {orphanFiles.length > 0 && (
          <div className="kan-banners">
            <ParseWarnings project={project} files={orphanFiles} />
          </div>
        )}
        {visible.length === 0 && show !== 'all' ? (
          <p className="board-empty" data-testid="board-empty">
            {EMPTY_FILTER_TEXT[show]}
          </p>
        ) : (
          <div className="kan-board" style={board} data-testid="kan-board">
            {visible.map((column) => (
              <KanbanColumn key={column.number} column={column} open={slide.phase === column.number} show={show} />
            ))}
          </div>
        )}
      </main>
      {slide.phase !== null && (
        <SlidePanel project={project} number={slide.phase} closing={slide.closing} onClose={close} banner={banner} />
      )}
    </>
  );
}
