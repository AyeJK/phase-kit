/**
 * The status bar (design-system.md "Status bar"): full width, split into one
 * segment per task status, each as wide as its share of the tasks (cut and
 * deferred included). Used by kanban columns, list view rows, the rail's
 * phase bar and each sprint card. Hovering a segment names it; the whole bar is
 * labelled for screen readers. Manual tasks sit right after blocked ones, in
 * violet beside blocked pink, so everything waiting on the user sits together
 * but the two still read apart.
 * Once any task is done or running, the bar is
 * `started` and not-started tasks show amber, as in the tasks table.
 * Styles: `.seg-bar` in `styles/app.css`.
 */
import type { Progress, TaskStatus } from '../../core/model.js';

/** Segment order and words. */
const SEGMENTS: readonly [TaskStatus, string][] = [
  ['done', 'complete'],
  ['active', 'running'],
  ['blocked', 'blocked'],
  ['manual', 'manual'],
  ['todo', 'not started'],
  ['unknown', 'unknown'],
  ['deferred', 'deferred'],
  ['cut', 'cut'],
];

export function StatusSegments({ progress, testId }: { progress: Progress | undefined; testId?: string }) {
  const parts = SEGMENTS.map(([status, word]) => ({ status, word, n: progress?.byStatus[status] ?? 0 })).filter(
    (p) => p.n > 0,
  );
  const label = parts.length === 0 ? 'No tasks' : parts.map((p) => `${p.n} ${p.word}`).join(', ');
  const started = (progress?.done ?? 0) + (progress?.byStatus.active ?? 0) > 0;
  return (
    <span className={started ? 'seg-bar started' : 'seg-bar'} role="img" aria-label={label} data-testid={testId}>
      {parts.map((p) => (
        <i key={p.status} data-status={p.status} style={{ flexGrow: p.n }} title={`${p.n} ${p.word}`} />
      ))}
    </span>
  );
}
