/**
 * Workspace detection: which project folder (the one holding `docs/phases/`)
 * the viewer should show, found the same way phase-builder's
 * `project-layout.md` finds `workspace_root`.
 *
 * Search order, stopping at the first level with a hit:
 *
 * 1. the current folder
 * 2. one level up (skipped when the current folder is a filesystem root)
 * 3. each immediate subfolder
 *
 * A level with one hit resolves the root. Two or more subfolder hits are all
 * returned as candidates and none is picked: detection never guesses. No hit
 * returns the folders that were searched, so the UI's empty state can say
 * where it looked.
 *
 * Read-only: `stat` and `readdir` only. Never throws; a folder that can't be
 * read counts as "no `docs/phases/` here".
 *
 * Every result is plain JSON data so the server's snapshot can carry it to the
 * browser unchanged.
 */
import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Workspace } from '../shared/protocol.js';

// The workspace types are part of the client protocol, so they live in the
// Node-free `shared/protocol.ts`; re-exported here for server code and tests.
export type {
  Workspace,
  WorkspaceCandidates,
  WorkspaceFound,
  WorkspaceNone,
  WorkspaceSource,
} from '../shared/protocol.js';

/** Path of the phases folder inside a project folder. */
export const PHASES_SUBPATH = path.join('docs', 'phases');

/** Whether `{folder}/docs/phases` is a directory (following symlinks). */
export async function hasPhasesDir(folder: string): Promise<boolean> {
  try {
    return (await stat(path.join(folder, PHASES_SUBPATH))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the project folder starting from `cwd`. See the module comment for the
 * search order.
 *
 * @param cwd The folder to start from; resolved to an absolute path.
 */
export async function detectWorkspace(cwd: string): Promise<Workspace> {
  const start = path.resolve(cwd);
  const searched: string[] = [start];

  if (await hasPhasesDir(start)) return { kind: 'found', root: start, source: 'cwd' };

  const parent = path.dirname(start);
  if (parent !== start) {
    searched.push(parent);
    if (await hasPhasesDir(parent)) return { kind: 'found', root: parent, source: 'parent' };
  }

  const hits: string[] = [];
  for (const child of await subfolders(start)) {
    searched.push(child);
    if (await hasPhasesDir(child)) hits.push(child);
  }

  const [only] = hits;
  if (hits.length === 1 && only !== undefined) return { kind: 'found', root: only, source: 'child' };
  if (hits.length > 1) return { kind: 'candidates', candidates: hits, searched };
  return { kind: 'none', searched };
}

/** Immediate subfolders of `folder` (symlinks to folders included), sorted by name. */
async function subfolders(folder: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      names.push(entry.name);
    } else if (entry.isSymbolicLink()) {
      try {
        if ((await stat(path.join(folder, entry.name))).isDirectory()) names.push(entry.name);
      } catch {
        // A dangling link is not a folder.
      }
    }
  }
  return names.sort((a, b) => a.localeCompare(b)).map((name) => path.join(folder, name));
}
