# File operations

Create folders, rename, copy and move, all through the engine's confined resolver (`os.Root`).
Nothing is ever overwritten unless the person chose to.

## Instant operations

| Endpoint             | Permission               | Notes                                       |
| -------------------- | ------------------------ | ------------------------------------------- |
| `POST /v1/fs/mkdir`  | `create` on the new path | Parent must exist; `files.exists` if taken. |
| `POST /v1/fs/rename` | `update` on the entry    | Same folder only; never replaces a name.    |

Names are one segment, 1–255 bytes, without `/`, `\` or control characters (`files.invalid_name`).

## Copy and move (job `transfer`)

1. `POST /v1/fs/transfer/plan` validates and lists existing targets (descending into folders that
   would merge, up to 500, `truncated` beyond). Nothing is written.
2. `POST /v1/jobs/transfer` queues the job with a `strategy` (`skip`, `overwrite`, `keep_both`) and
   optional per-target `decisions`.

Permissions: `copy` or `move` on every source (and read access), `create` on the destination
folder. Overwriting a target needs `update` on it; without it the item is skipped. Entries the
person cannot read are skipped, never copied.

Rules:

- Refused up front: a folder into itself (`files.into_itself`), a move to the folder it is already
  in (`files.same_location`), two sources with the same name (`files.duplicate_names`).
- Copying onto itself (same folder) always keeps both: `name (1).ext`.
- `overwrite` merges folder into folder and replaces file by file; a file never replaces a folder
  (or the reverse): skipped. Symbolic links are skipped, never followed.
- Copy checks free space first on Linux (`files.no_space`), keeps modification times, and removes
  a partially written file when cancelled or failing.
- Move renames when possible (instant). Across filesystems it copies each file, verifies its
  size (`files.verify_failed` keeps the source), then deletes it; folders are removed once
  empty, so anything skipped stays at the source.
- Results: items, bytes, skipped, renamed (kept both). Audit: `fs.mkdir`, `fs.rename`,
  `jobs.start` (kind `transfer`).

## In the file browser

- **New folder** (toolbar, when the folder allows `create`) and **Rename** (menu or F2; the name is
  preselected without its extension). Errors from the engine show inline in the dialog.
- **Copy to… / Move to…** (item menu, or the selection bar at the bottom): a folder picker that
  only accepts folders where the items can go. The pre-scan runs first; when names are taken, a
  dialog offers Skip / Replace / Keep both for all, then per item (only the choices that apply:
  a copy onto itself can only keep both, a file never replaces a folder).
- **Keyboard**: Ctrl+C / Ctrl+X then Ctrl+V pastes into the current folder.
- **Drag and drop** (mouse): drop items on a folder or a breadcrumb to move them; hold Ctrl (or
  Option) to copy. The target under the pointer is highlighted; the badge follows the pointer.
  List rows are positioned with `top` (not a transform): dnd-kit measures drop targets without
  their own transform. Touch screens use the menu
  instead, so dragging never fights scrolling.
- Copies and moves run as jobs in the operations panel (labelled Copy or Move, with items, size,
  skipped and kept-both counts). When any job finishes, open folders refresh.
