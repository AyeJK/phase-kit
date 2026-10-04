/**
 * The list view at `/list` (design-system.md "List view"): the 320px phase
 * list on the left and the selected phase's rail filling the rest. Clicking
 * a phase row swaps the rail; nothing slides.
 *
 * - `?phase=N` selects phase N. Without it the view selects the running
 *   phase, else the default phase (`impliedPhase`), and the URL stays as it
 *   is.
 * - The filter hides rows, never resizes them; the selected phase's rail
 *   stays even when its row is filtered out.
 * - A complete phase's row shows the green check in place of its task count,
 *   and no status bar.
 * - The rail's heading is a plain heading line here (no back arrow, not
 *   sticky), with the phase title as the page's `h1`.
 * - Below 900px the phase list becomes one sideways-scrolling row of compact
 *   items above the rail.
 *
 * Test hooks: `list-view`, `list-main`, `a[data-phase-item]` (with
 * `aria-current="page"` on the selected one), `.pi-done` (a complete
 * phase's check), `board-empty`, plus the rail's.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Project } from '../../core/model.js';
import { StatusIcon } from '../components/StatusIcon.js';
import { StatusSegments } from '../components/StatusSegments.js';
import { EMPTY_FILTER_TEXT, impliedPhase, kanbanColumns, matchesFilter } from '../board/derive.js';
import type { PhaseFilter } from '../rail/derive.js';
import { PhaseRail } from '../rail/PhaseRail.js';
import { Link, paths } from '../shell/router.js';
import { PhaseNotFound } from '../states/NotFound.js';
import './list.css';

interface ListViewProps {
  project: Project;
  /** The phase named in the URL, or `null`. */
  phase: number | null;
  show: PhaseFilter;
}

export function ListView({ project, phase, show }: ListViewProps) {
  const columns = useMemo(() => kanbanColumns(project), [project]);
  const visible = columns.filter((c) => matchesFilter(c.group, show));
  const selected = phase ?? impliedPhase(project);
  const selectedPhase = selected === null ? undefined : project.phases.find((p) => p.number === selected);

  // A newly selected phase starts at the top of its rail (unless a card is named).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === '') mainRef.current?.scrollTo(0, 0);
  }, [selected]);

  return (
    <div className="list-layout" data-testid="list-view">
      <nav className="phase-list" aria-label="Phases">
        {visible.length === 0 ? (
          <p className="board-empty" data-testid="board-empty">
            {show === 'all' ? 'No phases' : EMPTY_FILTER_TEXT[show]}
          </p>
        ) : (
          <ol>
            {visible.map((column) => {
              const current = column.number === selected;
              const complete = column.group === 'complete';
              const className = ['phase-item', column.group === 'future' ? 'future' : ''].filter(Boolean).join(' ');
              return (
                <li key={column.number}>
                  <Link
                    className={className}
                    to={paths.list({ phase: column.number, show })}
                    options={{ scroll: false }}
                    aria-current={current ? 'page' : undefined}
                    data-phase-item={column.number}
                    data-group={column.group}
                  >
                    <span className="pi-head">
                      <span className="num">Phase {column.number}</span>
                      {complete ? (
                        <span className="pi-done" role="img" aria-label="Complete">
                          <StatusIcon kind="pass" />
                        </span>
                      ) : (
                        <span className="pi-count">{column.countText}</span>
                      )}
                    </span>
                    <span className="pi-title">{column.title === '' ? `Phase ${column.number}` : column.title}</span>
                    {!complete && <StatusSegments progress={column.progress} notStarted={column.notStarted} />}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </nav>
      <main className="list-main" id="main" ref={mainRef} data-testid="list-main">
        {selectedPhase ? (
          <div className="list-rail">
            <PhaseRail key={selectedPhase.number} project={project} phase={selectedPhase} headingLevel={1} />
          </div>
        ) : selected !== null ? (
          <PhaseNotFound number={selected} />
        ) : null}
      </main>
    </div>
  );
}
