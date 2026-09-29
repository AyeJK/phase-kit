/**
 * Theme: `data-theme="dark" | "light"` on `<html>`.
 *
 * The theme menu in the top bar (`shell/ThemeMenu.tsx`) picks Light, Dark
 * or System, remembered in `localStorage`. System, the default, follows
 * `prefers-color-scheme` and falls back to dark. `index.html` sets the
 * attribute before first paint; this keeps it in sync when the choice or
 * the OS setting changes. Storage can be missing or throw, so a failed read
 * means System and a failed write just isn't remembered.
 */

export type Theme = 'dark' | 'light';
export type ThemePref = Theme | 'system';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const KEY = 'phase-viewer:theme';

/** The theme the OS asks for: `light` only when it says so, otherwise `dark`. */
export function systemTheme(): Theme {
  try {
    return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The remembered choice, or `system` when there's none (or storage can't be read). */
export function themePref(): ThemePref {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(): void {
  const pref = themePref();
  document.documentElement.dataset.theme = pref === 'system' ? systemTheme() : pref;
}

/** Remember `pref` and apply it now. */
export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {
    // Nothing remembered; the next visit follows the OS.
  }
  applyTheme();
}

/** Apply the chosen theme now and whenever the OS setting changes. Returns a function that stops following. */
export function followTheme(): () => void {
  applyTheme();
  let query: MediaQueryList;
  try {
    query = window.matchMedia(LIGHT_QUERY);
  } catch {
    return () => {};
  }
  query.addEventListener('change', applyTheme);
  return () => query.removeEventListener('change', applyTheme);
}
