/**
 * Several candidates (design-system.md "Several candidates"): detection found
 * `docs/phases/` in more than one subfolder and never guesses. The `.empty`
 * block lists each folder with the `npx phase-viewer --dir <path>` command
 * that opens it, as plain selectable text in a `code` chip. No copy buttons,
 * and nothing is picked.
 *
 * Test hooks: `[data-testid=candidates]`, `candidate` (with `data-path`),
 * `candidate-command`.
 */
import { baseName } from '../data/applyUpdate.js';
import { Wordmark } from '../shell/Wordmark.js';
import './states.css';

/** The command that starts the viewer on one folder. */
export function dirCommand(folder: string): string {
  return `npx phase-viewer --dir ${shellQuote(folder)}`;
}

/** A path as one shell argument: double-quoted only when it needs to be. */
function shellQuote(p: string): string {
  return /[\s"'`$&|;<>()!*?#]/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p;
}

export function Candidates({ candidates }: { candidates: readonly string[] }) {
  return (
    <div className="empty state-empty" data-testid="candidates">
      <Wordmark large />
      <h3>Several project folders found</h3>
      <p>
        Each of these {candidates.length} folders has a <code>docs/phases/</code>. Restart the viewer with the
        command for the one you want.
      </p>
      <ul className="candidates">
        {candidates.map((folder) => (
          <li key={folder} data-testid="candidate" data-path={folder}>
            <strong>{baseName(folder)}</strong>
            <code data-testid="candidate-command">{dirCommand(folder)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
