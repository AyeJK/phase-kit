/**
 * The top bar (design-system.md "Unified top bar"): 56px, the wordmark at the
 * left and the settings gear (theme) at the right. No tabs, phase picker,
 * project name or path, or live or connection indicator. The filter row sits
 * under it.
 */
import { SettingsMenu } from './SettingsMenu.js';
import { Wordmark } from './Wordmark.js';

export function TopBar({ inert = false }: { inert?: boolean }) {
  return (
    <header className="app-head" inert={inert}>
      <div className="brand">
        <Wordmark />
      </div>
      <SettingsMenu />
    </header>
  );
}
