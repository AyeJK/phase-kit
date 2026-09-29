/**
 * Shell states (design-system.md "States"): loading before the first
 * snapshot, and the connection-lost banner while the stream is down. The
 * workspace and page states (empty, candidates, parse warnings, not found)
 * live in `../states/`.
 */
import { StatusIcon } from '../components/StatusIcon.js';
import { formatTime, plural } from '../format.js';

/**
 * Shown in the main area until the first snapshot arrives. The number of
 * phase files is only known once the snapshot is here (the server sends it
 * the moment the stream opens), so without a count the copy drops the number.
 */
export function Loading({ phaseFiles = null }: { phaseFiles?: number | null }) {
  return (
    <div className="empty" role="status" data-testid="loading">
      <h3>Loading</h3>
      <p>{phaseFiles === null ? 'Reading phase files' : `Reading ${plural(phaseFiles, 'phase file')}`}</p>
    </div>
  );
}

/**
 * Shown only while disconnected, above the page, which keeps showing the
 * last snapshot. There is no indicator of any kind while connected.
 */
export function ConnectionLost({ since }: { since: number }) {
  return (
    <div className="banner warn" role="status" data-testid="connection-lost">
      <StatusIcon kind="warn" />
      <div>
        <strong>Lost connection to the viewer server.</strong>
        <p>Showing the last update from {formatTime(since)}.</p>
      </div>
    </div>
  );
}
