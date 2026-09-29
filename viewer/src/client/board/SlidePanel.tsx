/**
 * The slide-in panel (design-system.md "Slide-in panel"): a phase's rail in
 * a modal dialog that slides in from the right over a scrim, with the
 * kanban still mounted underneath.
 *
 * - The rail's heading bar gets the 44px back arrow ("Back to phases").
 * - The back arrow, a click on the scrim, or Escape calls `onClose`.
 * - Opening moves focus to the back arrow; Tab and Shift+Tab stay inside the
 *   panel (the page behind is `inert`, set by the board and App); the page
 *   behind doesn't scroll while the panel is mounted.
 * - `closing` plays the slide out; the board unmounts the panel after it.
 *   Under `prefers-reduced-motion: reduce` it appears and goes at once.
 * - An unknown phase shows the not-found block under the heading bar.
 *
 * Test hooks: `slide-panel` (with `data-phase`, `data-closing`), `scrim`,
 * `panel-back`, plus the rail's.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { Project } from '../../core/model.js';
import { PhaseRail } from '../rail/PhaseRail.js';
import { PhaseNotFound } from '../states/NotFound.js';

interface SlidePanelProps {
  project: Project;
  /** The phase shown. */
  number: number;
  /** Sliding out: no longer interactive. */
  closing: boolean;
  onClose: () => void;
  /** App-wide banners (connection lost), shown at the top of the panel body. */
  banner?: ReactNode;
}

/** What Tab can land on inside the panel. */
const FOCUSABLE = 'a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function SlidePanel({ project, number, closing, onClose, banner }: SlidePanelProps) {
  const phase = project.phases.find((p) => p.number === number);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the panel as it opens (and when it shows another phase).
  useEffect(() => {
    if (!closing) backRef.current?.focus({ preventScroll: true });
  }, [number, closing]);

  // Escape closes.
  useEffect(() => {
    if (closing) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closing, onClose]);

  // The page behind doesn't scroll.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  // Tab wraps around inside the panel.
  const trapTab = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.getClientRects().length > 0,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const back = (
    <button ref={backRef} type="button" className="back" aria-label="Back to phases" onClick={onClose} data-testid="panel-back">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M13 8H3.5M7.5 3.5L3 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <>
      <div className={closing ? 'scrim closing' : 'scrim'} onClick={closing ? undefined : onClose} aria-hidden="true" data-testid="scrim" />
      <aside
        ref={panelRef}
        className={closing ? 'slide closing' : 'slide'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={closing}
        onKeyDown={trapTab}
        data-testid="slide-panel"
        data-phase={number}
        data-closing={closing}
      >
        {phase ? (
          <PhaseRail key={phase.number} project={project} phase={phase} lead={back} headingLevel={2} titleId={titleId} banners={banner} />
        ) : (
          <div className="phase-rail">
            <header className="rail-head">
              {back}
              <h2 className="rail-title" id={titleId}>
                <span className="num">Phase {number}</span>
              </h2>
            </header>
            <div className="rail-body">
              {banner}
              <PhaseNotFound number={number} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
