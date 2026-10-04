/**
 * The status icon kinds `StatusIcon.tsx` draws. Kept in a plain `.ts` module
 * so pure derivations (`sprint/status.ts`) can name them without pulling in
 * JSX, and unit tests can import those derivations under the Node tsconfig.
 */
export type IconKind = 'pass' | 'run' | 'built' | 'wait' | 'fail' | 'needs' | 'manual' | 'warn';
