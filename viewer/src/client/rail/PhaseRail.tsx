/**
 * The phase rail (design-system.md "Phase rail", "Rail sprint cards", and
 * the heading bar of "Slide-in panel"): one phase's sprints in plan order as
 * sprint cards, with waves as a layer beside them.
 *
 * Top to bottom:
 *
 * - The 56px heading bar: an optional `lead` (the slide-in panel's back
 *   arrow), "Phase 2" and the title, "N/M tasks" and the phase's badge.
 * - Banners: open escalations, then parse warnings for the phase file and
 *   its run log.
 * - The phase's status bar.
 * - The "Sprints" line: "2 waves · 1 retry" (or the plain tag "No run log").
 * - One row per rail group from `railView`: the 180px wave cell (name with a
 *   check when done, mode, duration, retries) beside that group's cards.
 * - Once the run has ended (`runEnd`): "Phase run complete", in green, or
 *   pink / violet with what needs you ("1 task needs your attention").
 *
 * Cards start collapsed except the running ones (a gate running, or a failed
 * one about to be retried; a sprint that starts running later opens as it
 * starts); `#s{id}` opens that card and scrolls to it.
 * Opening or closing a card never changes another card. The rail keeps that
 * state across live updates, so render it with `key={phase.number}` when the
 * phase can change under it.
 *
 * Everything shown comes from `railView` (`derive.ts`), recomputed on every
 * stream update and once a minute while a wave is running (its "so far").
 *
 * Test hooks: `phase-rail` (with `data-phase`), `phase-progress-text`,
 * `phase-status`, `phase-status-bar`, `rail-summary`,
 * `section[data-rail-row]` (with `data-kind`, `data-row-state`),
 * `wave-name`, `wave-mode`, `wave-duration`, `wave-retries`,
 * `escalation-banner`, `run-end` (with `data-kind`), plus those in `SprintCard.tsx`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Escalation, Phase, Project } from '../../core/model.js';
import { StatusIcon } from '../components/StatusIcon.js';
import { StatusSegments } from '../components/StatusSegments.js';
import { notStartedTasks, phaseLabel, phaseRuns } from '../data/status.js';
import { plural } from '../format.js';
import { ESCALATION_TEXT, escalationTitle } from '../live/derive.js';
import { paths, useRouter } from '../shell/router.js';
import { ParseWarnings } from '../states/ParseWarnings.js';
import { phaseFiles } from '../states/warnings.js';
import { StatusBadge } from '../sprint/parts.js';
import { phaseBadge } from '../sprint/status.js';
import { isActiveState, railView, runEnd, type RailRow, type RailView, type RunEnd } from './derive.js';
import { SprintCard } from './SprintCard.js';
import './rail.css';

export interface PhaseRailProps {
  project: Project;
  phase: Phase;
  /** Drawn first in the heading bar, before "Phase N": the slide-in panel's back arrow. */
  lead?: ReactNode;
  /** Level of the phase title heading: 1 on its own page (default), 2 inside a panel. */
  headingLevel?: 1 | 2;
  /** `id` of the title heading, for the panel's `aria-labelledby`. */
  titleId?: string;
  /** App-wide banners shown before the phase's own (the connection-lost banner inside the slide-in panel). */
  banners?: ReactNode;
}

export function PhaseRail({ project, phase, lead, headingLevel = 1, titleId, banners }: PhaseRailProps) {
  // Re-derived on every update, and each minute while a wave runs.
  const [tick, setTick] = useState(0);
  const view = useMemo(() => railView(project, phase, Date.now()), [project, phase, tick]);
  const running = view.rows.some((r) => r.state === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [running]);

  const open = useOpenCards(view);
  const end = runEnd(view);

  const runs = phaseRuns(project, phase.number);
  const progress = project.progress.byPhase[String(phase.number)];
  const done = progress?.done ?? 0;
  const eligible = progress?.eligible ?? 0;

  const Title = `h${headingLevel}` as const;
  const Sub = `h${headingLevel + 1}` as 'h2' | 'h3';
  const cardLevel = (headingLevel + 2) as 3 | 4;

  return (
    <div className="phase-rail" data-testid="phase-rail" data-phase={phase.number}>
      <header className="rail-head">
        {lead}
        {/* Named outright: the flex layout would otherwise read "Phase 2 : Title" (it names the panel's dialog too). */}
        <Title className="rail-title" id={titleId} aria-label={phaseLabel(phase)}>
          <span className="num">
            Phase {phase.number}
            {phase.title !== '' && <span className="visually-hidden">:</span>}
          </span>{' '}
          {phase.title !== '' && (
            <span className="rail-name" title={phase.title}>
              {phase.title}
            </span>
          )}
        </Title>
        <span className="rail-count" data-testid="phase-progress-text">
          {done}/{eligible} {eligible === 1 ? 'task' : 'tasks'}
        </span>
        <StatusBadge badge={phaseBadge(project, phase)} testId="phase-status" />
      </header>

      <div className="rail-body">
        <div className="rail-banners">
          {banners}
          {(runs?.escalations ?? []).map((escalation) => (
            <EscalationBanner key={escalation.line} escalation={escalation} />
          ))}
          <ParseWarnings project={project} files={phaseFiles(project, phase)} />
        </div>

        <StatusSegments progress={progress} notStarted={notStartedTasks(project, phase)} testId="phase-status-bar" />

        <div className="rail-meta">
          <Sub className="rail-h">Sprints</Sub>
          {view.hasRunLog ? (
            <span data-testid="rail-summary">
              <b>{plural(view.waves, 'wave')}</b> · {plural(view.retries, 'retry', 'retries')}
            </span>
          ) : (
            <span className="tag" data-testid="rail-summary">
              No run log
            </span>
          )}
        </div>

        {view.rows.map((row) => (
          <section
            key={row.key}
            className="rail-row"
            aria-label={row.label}
            data-rail-row={row.key}
            data-kind={row.kind}
            data-row-state={row.state ?? ''}
          >
            <WaveCell row={row} />
            <div className="rail-cards">
              {row.sprints.map((sprint) => (
                <SprintCard
                  key={sprint.id}
                  sprint={sprint}
                  open={open.ids.has(sprint.id)}
                  onToggle={() => open.toggle(sprint.id)}
                  dashed={row.kind === 'not-run'}
                  headingLevel={cardLevel}
                />
              ))}
            </div>
          </section>
        ))}

        {end && <RunEndBanner end={end} />}
      </div>
    </div>
  );
}

/** Under the last wave once the run has ended: complete, or what needs you. */
function RunEndBanner({ end }: { end: RunEnd }) {
  return (
    <div className={`banner rail-end ${end.kind}`} role="status" data-testid="run-end" data-kind={end.kind}>
      <StatusIcon kind={end.kind} />
      <div>
        <strong>{end.title}</strong>
        {end.attentionText !== null && <span className="rail-end-attention"> · {end.attentionText}</span>}
        {end.items.length > 0 && (
          <ul>
            {end.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Which cards are open. Starts with the running ones; a card that starts
 * running later opens once, as it starts; `#s{id}` opens that card and
 * scrolls to it. Toggling changes only the card toggled.
 */
function useOpenCards(view: RailView): { ids: ReadonlySet<string>; toggle: (id: string) => void } {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(runningIds(view)));
  const seen = useRef<Set<string>>(new Set(runningIds(view)));

  useEffect(() => {
    const started = runningIds(view).filter((id) => !seen.current.has(id));
    if (started.length === 0) return;
    for (const id of started) seen.current.add(id);
    setIds((prev) => new Set([...prev, ...started]));
  }, [view]);

  const { location } = useRouter();
  useEffect(() => {
    const id = sprintIdFromHash(location.hash);
    if (id === null) return;
    setIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    // Scroll once the card has opened (the next frame, after React commits).
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(paths.sprintSection(id))?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  const toggle = (id: string): void =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return { ids, toggle };
}

function runningIds(view: RailView): string[] {
  return view.rows.flatMap((r) => r.sprints.filter((s) => isActiveState(s.state)).map((s) => s.id));
}

/** `#s2.3` → `2.3`; anything else → `null`. */
function sprintIdFromHash(hash: string): string | null {
  if (!hash.startsWith('#s') || hash.length < 3) return null;
  try {
    return decodeURIComponent(hash.slice(2));
  } catch {
    return null;
  }
}

/** The wave column cell: name (and state icon), mode, duration, retries. Dashed groups show the name only. */
function WaveCell({ row }: { row: RailRow }) {
  if (row.kind !== 'wave') {
    return (
      <div className="wave-cell dashed">
        <div className="wave-cell-head">
          <span className="wave-name" data-testid="wave-name">
            {row.label}
          </span>
        </div>
      </div>
    );
  }
  const unlogged = row.durationText === 'start not logged';
  return (
    <div className={`wave-cell ${row.state ?? ''}`}>
      <div className="wave-cell-head">
        <span className="wave-name" data-testid="wave-name">
          {row.label}
        </span>
        {row.state === 'done' && <StatusIcon kind="pass" />}
        {row.state === 'running' && <StatusIcon kind="run" />}
        <span className="visually-hidden">{row.state === 'done' ? ', done' : ', running'}</span>
      </div>
      <span className="wave-sep" aria-hidden="true">
        ·
      </span>
      <span className={row.parallel ? 'mode par' : 'mode'} data-testid="wave-mode">
        {row.parallel ? '∥ Parallel' : 'Sequential'}
      </span>
      <span className="wave-sep" aria-hidden="true">
        ·
      </span>
      <span className={unlogged ? 'wave-dur unlogged' : 'wave-dur'} data-testid="wave-duration">
        {row.durationText}
      </span>
      {row.retries > 0 && (
        <>
          <span className="wave-sep" aria-hidden="true">
            ·
          </span>
          <span className="wave-retries" data-testid="wave-retries">
            {plural(row.retries, 'retry', 'retries')}
          </span>
        </>
      )}
    </div>
  );
}

/** Needs-you banner for a gate that hit its retry limit. It goes once a later event for the sprint is logged. */
function EscalationBanner({ escalation }: { escalation: Escalation }) {
  return (
    <div
      className="banner esc"
      role="alert"
      data-testid="escalation-banner"
      data-sprint={escalation.sprint}
      data-gate={escalation.gate}
    >
      <StatusIcon kind="needs" />
      <div>
        <strong>{escalationTitle(escalation)}</strong>
        <p>{ESCALATION_TEXT}</p>
      </div>
    </div>
  );
}
