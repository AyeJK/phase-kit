/**
 * Server-sent events for `GET /api/events`.
 *
 * Every client gets the whole model first, then one event per
 * {@link StateUpdate} as files change:
 *
 * | Event      | `data` (JSON) |
 * |------------|---------------|
 * | `snapshot` | {@link ViewerSnapshot}: `{ workspace, project }`. Sent once, first, on every connect (a reconnect gets a fresh one). |
 * | `phase`    | {@link PhaseUpdate}: `{ type, file, phase, progress }` |
 * | `run`      | {@link RunUpdate}: `{ type, file, runs }` |
 * | `removed`  | {@link RemovedUpdate}: `{ type, kind, file, number, progress }` |
 * | `warnings` | {@link WarningsUpdate}: `{ type, warnings }` |
 * | `design`   | {@link DesignUpdate}: `{ type, hasDesignSystem }` |
 *
 * The event name is always the update's `type`, and `data` is the update
 * object unchanged, so a client can apply either the named event or the
 * parsed `data` alone. Phases and runs are keyed by `file` (absolute path).
 *
 * A `: heartbeat` comment goes out every {@link DEFAULT_HEARTBEAT_MS} so
 * proxies and idle timeouts don't drop a quiet stream; `EventSource` ignores
 * comments. The stream opens with `retry: 1000` so a dropped browser
 * reconnects within a second.
 *
 * Read-only: the hub only writes to HTTP responses.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SseEventName, StateUpdate, ViewerSnapshot } from '../shared/protocol.js';

// The event names, snapshot and update shapes are the client protocol, so
// they live in the Node-free `shared/protocol.ts`; re-exported here for
// server code and tests.
export { SSE_EVENTS } from '../shared/protocol.js';
export type {
  DesignUpdate,
  PhaseUpdate,
  RemovedUpdate,
  RunUpdate,
  SseEventName,
  StateUpdate,
  ViewerSnapshot,
  WarningsUpdate,
} from '../shared/protocol.js';

/** Interval between heartbeat comments. */
export const DEFAULT_HEARTBEAT_MS = 15_000;

/** Reconnect delay suggested to `EventSource` (the `retry:` field). */
export const RETRY_MS = 1_000;

/** Options for {@link createEventHub}. */
export interface EventHubOptions {
  /** Interval between heartbeat comments. Default {@link DEFAULT_HEARTBEAT_MS}. */
  heartbeatMs?: number;
}

/** Fans updates out to every open event stream. */
export interface EventHub {
  /**
   * Turn a response into an event stream: write the headers, `retry:` and the
   * `snapshot` event, then every later {@link broadcast} until the client
   * disconnects. Its heartbeat timer and subscription are removed when the
   * response closes (client gone, or {@link close}).
   */
  connect(req: IncomingMessage, res: ServerResponse, snapshot: ViewerSnapshot): void;
  /** Send each update to every open stream, in order, as its named event. */
  broadcast(updates: readonly StateUpdate[]): void;
  /** Open streams. */
  readonly size: number;
  /** End every open stream and refuse new ones. Safe to call twice. */
  close(): void;
}

/** One SSE frame: `event:` plus one `data:` line per line of the JSON. */
export function formatEvent(event: SseEventName, data: unknown): string {
  const json: string | undefined = JSON.stringify(data);
  // JSON.stringify never emits raw newlines, but split anyway so the frame stays valid.
  const lines = (json ?? 'null').split(/\r\n|\r|\n/).map((line) => `data: ${line}`);
  return `event: ${event}\n${lines.join('\n')}\n\n`;
}

/** A heartbeat frame (a comment line, ignored by `EventSource`). */
export const HEARTBEAT_FRAME = ': heartbeat\n\n';

/** Create an {@link EventHub}. */
export function createEventHub(options: EventHubOptions = {}): EventHub {
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  /** Open streams, each with its cleanup. */
  const clients = new Map<ServerResponse, () => void>();
  let closed = false;

  function send(res: ServerResponse, frame: string): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(frame);
  }

  return {
    connect(req, res, snapshot) {
      if (closed) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Server is shutting down\n');
        return;
      }
      req.socket.setKeepAlive(true);
      req.socket.setNoDelay(true);
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(`retry: ${RETRY_MS}\n\n`);
      res.write(formatEvent('snapshot', snapshot));

      const heartbeat = setInterval(() => send(res, HEARTBEAT_FRAME), heartbeatMs);
      heartbeat.unref();

      // Listen on the response, not the request: a GET request can emit
      // 'close' as soon as its (empty) body is read, while the response's
      // 'close' fires when the stream ends or the client goes away.
      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        clients.delete(res);
        res.off('close', cleanup);
        res.off('error', cleanup);
      };
      clients.set(res, cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
    },

    broadcast(updates) {
      if (closed || updates.length === 0) return;
      const frames = updates.map((update) => formatEvent(update.type, update)).join('');
      for (const res of clients.keys()) send(res, frames);
    },

    get size() {
      return clients.size;
    },

    close() {
      if (closed) return;
      closed = true;
      for (const [res, cleanup] of [...clients]) {
        cleanup();
        if (!res.writableEnded) res.end();
      }
      clients.clear();
    },
  };
}
