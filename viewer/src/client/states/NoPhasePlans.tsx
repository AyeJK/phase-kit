/**
 * No phase plans (design-system.md "No phase plans (empty)"): the `.empty`
 * block with the large PHASE RUNNER wordmark, "No phase plans found", and
 * where the viewer looked. Paths are `code` chips, selectable as text. No
 * buttons: the viewer can't act, so it says where the user can.
 *
 * Two ways to get here:
 *
 * - Detection found no `docs/phases/` (`searched`): the current folder, one
 *   level up (unless it's a filesystem root) and each immediate subfolder,
 *   in the order the server searched them.
 * - The project folder was settled but holds no phase plans (`phasesDir`):
 *   `--dir` at a folder without `docs/phases/`, or a `docs/phases/` with no
 *   `Phase-N` files yet. The page switches to the project by itself once one
 *   appears.
 *
 * Test hooks: `[data-testid=no-phase-plans]`, `searched` (rows carry
 * `data-level`: `here`, `up`, `down`), `searched-dir`.
 */
import { baseName } from '../data/applyUpdate.js';
import { Wordmark } from '../shell/Wordmark.js';
import './states.css';

/** Subfolders shown by name before the rest are counted. */
const MAX_SUBFOLDERS = 12;

/** The restart hint every startup state ends with. */
export function RestartHint() {
  return (
    <p className="state-next">
      Restart with <code>npx phase-viewer --dir &lt;path&gt;</code> to point the viewer at a project folder.
    </p>
  );
}

export function NoPhasePlans(props: { searched: readonly string[] } | { phasesDir: string }) {
  return (
    <div className="empty state-empty" data-testid="no-phase-plans">
      <Wordmark large />
      <h3>No phase plans found</h3>
      {'searched' in props ? (
        <Searched searched={props.searched} />
      ) : (
        <p data-testid="searched-dir">
          Looked for <code>Phase-N</code> files in <code>{props.phasesDir}</code>.
        </p>
      )}
      <RestartHint />
    </div>
  );
}

function Searched({ searched }: { searched: readonly string[] }) {
  const { here, up, down } = searchLevels(searched);
  const shown = down.slice(0, MAX_SUBFOLDERS);
  const more = down.length - shown.length;

  return (
    <>
      <p>
        Looked for <code>docs/phases/</code> in this folder{up !== null ? ', one level up' : ''} and one level down.
      </p>
      <dl className="searched" data-testid="searched">
        {here !== null && (
          <div data-level="here">
            <dt>This folder</dt>
            <dd>
              <code>{here}</code>
            </dd>
          </div>
        )}
        {up !== null && (
          <div data-level="up">
            <dt>One level up</dt>
            <dd>
              <code>{up}</code>
            </dd>
          </div>
        )}
        <div data-level="down">
          <dt>One level down</dt>
          <dd>
            {down.length === 0 ? (
              'No subfolders'
            ) : (
              <>
                {shown.map((folder) => (
                  <code key={folder} title={folder}>
                    {baseName(folder)}
                  </code>
                ))}
                {more > 0 && <span className="more">and {more} more</span>}
              </>
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}

/** Forward slashes, lower case on Windows-looking paths, no trailing slash (except a root). */
function norm(p: string): string {
  const slashed = p.replace(/\\/g, '/');
  const trimmed = slashed.length > 1 && !/^[a-z]:\/$/i.test(slashed) ? slashed.replace(/\/+$/, '') : slashed;
  return /^[a-z]:/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/** Whether `child` sits directly or deeper inside `parent`. */
function isInside(child: string, parent: string): boolean {
  const c = norm(child);
  const p = norm(parent);
  const prefix = p.endsWith('/') ? p : `${p}/`;
  return c !== p && c.startsWith(prefix);
}

/**
 * Split the server's search list into its levels: the first entry is the
 * current folder; the next is one level up when the current folder sits
 * inside it; the rest are subfolders.
 */
function searchLevels(searched: readonly string[]): { here: string | null; up: string | null; down: string[] } {
  const [here, ...rest] = searched;
  if (here === undefined) return { here: null, up: null, down: [] };
  const [first] = rest;
  const up = first !== undefined && isInside(here, first) ? first : null;
  return { here, up, down: up !== null ? rest.slice(1) : rest };
}
