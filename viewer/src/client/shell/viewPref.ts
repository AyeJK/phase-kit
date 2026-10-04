/**
 * The last layout used (Kanban or List), remembered in `localStorage` so a
 * bare `/` opens it on the next visit (`router.tsx`). With nothing
 * remembered, `/` opens the list view. Storage can be missing or throw
 * (private windows, blocked site data), so every read and write is guarded
 * and a failure just means nothing is remembered.
 */

export type ViewKind = 'kanban' | 'list';

/** The layout a bare `/` opens when none is remembered. */
export const DEFAULT_VIEW: ViewKind = 'list';

const KEY = 'phase-viewer:view';

/** The remembered layout, or `null` when there's none (or storage can't be read). */
export function rememberedView(): ViewKind | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'kanban' || value === 'list' ? value : null;
  } catch {
    return null;
  }
}

/** Remember `view` as the last layout used. */
export function rememberView(view: ViewKind): void {
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // Nothing remembered; `/` opens the default layout.
  }
}
