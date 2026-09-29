/**
 * Port binding shared by the CLI and the HTTP server.
 *
 * Lives apart from `cli.ts` so `http.ts` can bind with
 * {@link listenOnFreePort} without importing the CLI (which imports the
 * server as its default starter). `cli.ts` re-exports everything here.
 */
import { createServer as createNetServer, type AddressInfo, type Server as NetServer } from 'node:net';

/** The server listens on loopback only: the viewer is a local, single-user tool. */
export const HOST = '127.0.0.1';

/** How many consecutive ports to try, starting at the requested one. */
export const PORT_ATTEMPTS = 20;

/** Highest valid TCP port. */
export const MAX_PORT = 65535;

/**
 * Listen on the first free port from `start` upward (at most `attempts`
 * ports, never past 65535) and resolve with the port bound. A port counts as
 * taken on `EADDRINUSE` or `EACCES` (Windows reserves some ranges); any other
 * error rejects at once.
 *
 * Works for any `net.Server`, so an HTTP server binds with it directly and
 * there is no gap between choosing a port and taking it.
 */
export async function listenOnFreePort(
  server: NetServer,
  start: number,
  host: string = HOST,
  attempts: number = PORT_ATTEMPTS,
): Promise<number> {
  const last = Math.min(start + Math.max(attempts, 1) - 1, MAX_PORT);
  for (let port = start; port <= last; port++) {
    try {
      await listenOnce(server, port, host);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE' || code === 'EACCES') continue;
      throw err;
    }
    return (server.address() as AddressInfo).port;
  }
  throw new Error(start === last ? `port ${start} is taken` : `ports ${start}-${last} are all taken`);
}

/**
 * The first free port from `start` upward, found by briefly listening on it.
 * Prefer {@link listenOnFreePort} on the real server; another process can take
 * the port between this probe and a later listen.
 */
export async function findFreePort(
  start: number,
  host: string = HOST,
  attempts: number = PORT_ATTEMPTS,
): Promise<number> {
  const probe = createNetServer();
  const port = await listenOnFreePort(probe, start, host, attempts);
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** One `listen` call, settled by its `listening` or `error` event. */
function listenOnce(server: NetServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ port, host, exclusive: true });
  });
}
