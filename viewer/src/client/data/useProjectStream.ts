/**
 * `useProjectStream()`: the live project, from the server's `/api/events`
 * stream.
 *
 * - Opens an `EventSource` on mount. The server sends a `snapshot` first on
 *   every connect, then one named event per update (`phase`, `run`,
 *   `removed`, `warnings`, `design`), each folded in with `applyUpdate`.
 * - `status` is `connecting` until the first snapshot, `live` while a stream
 *   is open and synced, and `reconnecting` after a stream that had delivered
 *   a snapshot drops.
 * - On a drop the last snapshot stays. The browser retries by itself (the
 *   server asks for a 1 s `retry`); when it gives up (the stream answered
 *   with an error, as the dev proxy does while the server is down) the hook
 *   opens a new `EventSource` with backoff, from 1 s up to 10 s. A reconnect
 *   gets a fresh snapshot, which replaces the old one.
 * - `lastUpdateAt` is when the last snapshot or update arrived
 *   (`Date.now()`), for "Showing the last update from {time}".
 */
import { useEffect, useState } from 'react';
import type { ViewerSnapshot } from '../../shared/protocol.js';
import { applyUpdate, parseSnapshot, parseUpdate, UPDATE_EVENTS } from './applyUpdate.js';

/** Where the client listens. */
export const EVENTS_URL = '/api/events';

/** Connection state. See the module comment. */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

/** What {@link useProjectStream} returns. */
export interface ProjectStream {
  status: ConnectionStatus;
  /** The latest model, or `null` before the first snapshot. Kept while reconnecting. */
  snapshot: ViewerSnapshot | null;
  /** `Date.now()` when the last snapshot or update arrived; `null` before the first. */
  lastUpdateAt: number | null;
}

/** First manual reconnect delay after the browser gives up on a stream. */
const RECONNECT_MIN_MS = 1_000;
/** Longest manual reconnect delay. */
const RECONNECT_MAX_MS = 10_000;

const INITIAL: ProjectStream = { status: 'connecting', snapshot: null, lastUpdateAt: null };

export function useProjectStream(url: string = EVENTS_URL): ProjectStream {
  const [stream, setStream] = useState<ProjectStream>(INITIAL);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: number | undefined;
    let failures = 0;
    let disposed = false;

    const onSnapshot = (event: MessageEvent<string>): void => {
      const snapshot = parseSnapshot(event.data);
      if (!snapshot) return;
      failures = 0;
      setStream({ status: 'live', snapshot, lastUpdateAt: Date.now() });
    };

    const onUpdate = (event: MessageEvent<string>): void => {
      const update = parseUpdate(event.data);
      if (!update) return;
      setStream((prev) =>
        prev.snapshot ? { ...prev, snapshot: applyUpdate(prev.snapshot, update), lastUpdateAt: Date.now() } : prev,
      );
    };

    const connect = (): void => {
      if (disposed) return;
      const es = new EventSource(url);
      source = es;
      es.addEventListener('snapshot', onSnapshot);
      for (const name of UPDATE_EVENTS) es.addEventListener(name, onUpdate);
      es.addEventListener('error', () => {
        if (disposed || source !== es) return;
        setStream((prev) => {
          const status: ConnectionStatus = prev.snapshot ? 'reconnecting' : 'connecting';
          return prev.status === status ? prev : { ...prev, status };
        });
        if (es.readyState === EventSource.CLOSED) {
          // The browser won't retry this one; open a new stream after a backoff.
          es.close();
          const delay = Math.min(RECONNECT_MIN_MS * 2 ** failures, RECONNECT_MAX_MS);
          failures++;
          window.clearTimeout(timer);
          timer = window.setTimeout(connect, delay);
        }
      });
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      source?.close();
      source = null;
    };
  }, [url]);

  return stream;
}
