/**
 * The top bar (design-system.md "Unified top bar"): 56px, the wordmark and
 * nothing else. No tabs, phase picker, project name or path, live or
 * connection indicator, or theme toggle. The filter row sits under it.
 */
import { Wordmark } from './Wordmark.js';

export function TopBar({ inert = false }: { inert?: boolean }) {
  return (
    <header className="app-head" inert={inert}>
      <div className="brand">
        <Wordmark />
      </div>
    </header>
  );
}
