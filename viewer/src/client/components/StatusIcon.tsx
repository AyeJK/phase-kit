/**
 * The seven status icons from the design system (16×16, `currentColor`).
 * `run` is a spinning ring, the one looping animation, so anything in
 * progress reads as working. `manual` (a person in a ring) marks a MANUAL task, one only the user can do;
 * `needs` (an exclamation in a ring) marks a blocked task or an escalation.
 * Colour comes from the `.i.{kind}` classes in `base.css`.
 */
import type { ReactNode } from 'react';
import type { IconKind } from './iconKind.js';

export type { IconKind };

export function StatusIcon({ kind, className }: { kind: IconKind; className?: string }) {
  return (
    <svg className={`i ${kind}${className ? ` ${className}` : ''}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {PATHS[kind]}
    </svg>
  );
}

const PATHS: Record<IconKind, ReactNode> = {
  pass: (
    <>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  run: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  wait: <circle cx="8" cy="8" r="3" fill="currentColor" />,
  fail: (
    <>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  needs: (
    <>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r="1" fill="currentColor" />
    </>
  ),
  manual: (
    <>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="5.9" r="1.7" fill="currentColor" />
      <path d="M5.1 11.8a2.9 2.9 0 0 1 5.8 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  warn: (
    <>
      <path d="M8 1.8l6.6 12H1.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.2v3.6M8 11.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};
