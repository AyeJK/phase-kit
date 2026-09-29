/**
 * The PHASE RUNNER wordmark: Monoton outlined to SVG
 * (`assets/phase-runner-wordmark.svg`, copied from the design pass), inlined
 * so it takes `currentColor` (`--wordmark`) and the `--wordmark-glow` filter.
 */
import wordmarkSvg from '../assets/phase-runner-wordmark.svg?raw';

/** The outline path, read once from the asset. */
const PATH = /\sd="([^"]+)"/.exec(wordmarkSvg)?.[1] ?? '';

export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? 'wm wm-lg' : 'wm'}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="93 -1728 18771 1800"
      role="img"
      aria-label="Phase Runner"
    >
      <path fill="currentColor" d={PATH} />
    </svg>
  );
}
