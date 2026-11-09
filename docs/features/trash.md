# Trash

Deleted items go to a trash **inside their own volume** (`<volume>/.canopy-trash/<id>/<name>`,
plus `<id>.json`): deleting is an instant rename, and restoring puts the item back.

## Rules

- Deleting needs `delete` on each item. Top-level folders are volumes (mounts) and cannot be
  deleted (`files.volume_protected`).
- People see and restore their own deletions; administrators see every item. Restoring needs
  `create` at the original place; a name taken meanwhile keeps both (`name (1)`); missing parent
  folders are recreated.
- Permanent deletion (bypassing the trash) and emptying the trash run as jobs.
- Every change is audited: `fs.delete` (to the trash or permanent), `trash.restore`,
  `trash.empty`, `trash.purge` (automatic, with its reason).

## Limits (anti-abuse)

Per volume, from Settings › Trash: a **retention** period (30 days), a **maximum size** (10 GiB)
and a **maximum number of files** (10,000). The trash can therefore never be used to hold an
unbounded amount of data or files.

- A background keeper runs after every delete and every hour: it measures new items (files and
  bytes), removes items past retention, then removes the **oldest** items until the volume's
  trash is within both limits. Each removal is audited as `trash.purge`.
- Before deleting, `POST /v1/fs/delete/plan` measures the selection (2 s budget). When it does not
  fit the limits (or is too large to measure in time), the web app does not pretend it can be
  restored: it offers a permanent delete with a strong warning instead.

## API

`POST /v1/fs/delete/plan`, `POST /v1/fs/trash`, `POST /v1/jobs/delete`, `GET /v1/trash`,
`POST /v1/trash/restore`, `POST /v1/jobs/empty-trash`.

## In the web app

- **Delete** (item menu, Delete key, selection bar) measures the selection first. If it fits the
  trash: a confirmation, then a toast with **Undo** (10 s) that restores at once. If it does not
  fit (or with **Shift+Delete**): a red warning stating the size and that nothing can be
  restored, then a permanent delete job in the operations panel.
- **Trash** page (sidebar, under Files): deleted items with where they were, when, how long they
  are kept, their size (measured shortly after deletion); restore one or a selection, delete a
  selection for good, or empty the trash (both behind a red confirmation). Administrators also
  see who deleted each item (by username).
- Settings › Trash: retention, maximum size and maximum files per volume.
