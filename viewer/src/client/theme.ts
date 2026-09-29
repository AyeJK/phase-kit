/**
 * Theme: `data-theme="dark" | "light"` on `<html>`.
 *
 * The design system leaves the choice open, so until it's decided the viewer
 * follows `prefers-color-scheme` and falls back to dark, with no toggle in
 * the UI. `index.html` sets the attribute before first paint; this keeps it
 * in sync when the OS setting changes.
 */

export type Theme = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** The theme the OS asks for: `light` only when it says so, otherwise `dark`. */
export function systemTheme(): Theme {
  try {
    return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Apply the system theme now and on every change. Returns a function that stops following. */
export function followSystemTheme(): () => void {
  const apply = (): void => {
    document.documentElement.dataset.theme = systemTheme();
  };
  apply();
  let query: MediaQueryList;
  try {
    query = window.matchMedia(LIGHT_QUERY);
  } catch {
    return () => {};
  }
  query.addEventListener('change', apply);
  return () => query.removeEventListener('change', apply);
}
