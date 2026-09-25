# Project Layout Resolution

Resolved **once**, at Step 1, alongside `runtime-adapter.md`. Cache both absolute paths for the entire run — never re-resolve per sprint.

Two roots matter, and they are not always the same folder:

| Root | Contains | Used for |
|---|---|---|
| `workspace_root` | `docs/phases/`, `docs/design/` | phase files, design system, doc-sync target |
| `app_root` | The manifest file for your stack (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) and `src/` | Running checks/tests, dev server, where implementation agents edit code |

---

## Resolution steps

1. **Look for `docs/phases/` first**, starting at the current working directory, then one level up, then one level down (each immediate subfolder). Wherever it lives is `workspace_root`. If the one-level-down search finds it in more than one subfolder, ask the user once which one. This covers sessions started in a coordination folder that holds the repo as a subfolder.
2. **Look for a stack manifest** in `workspace_root` itself. If found there, `app_root == workspace_root` — this is a **single-folder layout** (docs and code live together, common for small projects).
3. **If no manifest in `workspace_root`**, look for exactly one subfolder containing a manifest (commonly named `{project}-repo/`, `app/`, `src-repo/`, or similar — no fixed convention, just look for the manifest). That subfolder is `app_root` — this is a **split layout** (a coordination folder with docs/design separate from the app repo, useful when phase files should survive a full app rewrite).
4. **If multiple subfolders contain manifests** (monorepo, or ambiguous layout), do not guess. Ask the user once:
   ```
   Found multiple candidate app roots:
     1. {path A}
     2. {path B}
   Which one should sprint implementation and verify run against? (Or: multiple — I'll ask per-sprint if tasks touch different packages.)
   ```
5. **In worktree mode** (phase-runner Step 0.5), re-resolve after the session enters the worktree: both roots become the worktree itself.
6. **If the user states paths explicitly** ("workspace root is X, app root is Y") — use those, skip detection entirely.

## Report before proceeding

```
Project layout:
  workspace_root: {absolute path}
  app_root:       {absolute path}
  layout:         single-folder | split
```

## Stack detection (for default verify command)

Once `app_root` is known, check for a manifest to pick a sensible default CLI check command — this feeds `phase-verify`'s `default_command`. A sprint's own `### Verification` `cli:` line always overrides this.

| Manifest found | Default command |
|---|---|
| `package.json` | `npm run check` if that script exists, else `npm run build && npm run lint` (adjust per what scripts actually exist) |
| `pyproject.toml` / `requirements.txt` | `pytest` (or the project's configured test runner) |
| `Cargo.toml` | `cargo build && cargo test` |
| `go.mod` | `go build ./... && go test ./...` |
| None recognized | Ask the user once for the check command; cache it |

Do not hardcode `npm run check` as a universal default — it's a Node convention, not a universal one. Detect, then confirm.
