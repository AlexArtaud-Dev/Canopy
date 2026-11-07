# Folder access (path grants)

- **Where**: a "Folder access" card on each group page (`/admin/groups/<id>`) and on each user's
  page (`/admin/users/<id>`, from the users table menu). Editing needs `groups:update` /
  `users:update`.
- **Rule**: folder (picked through the engine, folders only), effect allow/deny, path actions
  (presets: read only, read & write, full control). A rule covers everything inside the folder.
- **Resolution** (engine `internal/authz`): administrators (`system:admin`) bypass rules; the
  deepest matching rule wins; at equal depth user rules beat group rules, then deny beats allow;
  no rule means no access. Folders leading to a granted one are listed (names only).
- **Listing API**: `GET /v1/fs/list?path=&dirsOnly=&sort=&order=&offset=&limit=` with a web-signed
  token; entries carry the caller's actions. Host paths never leave the engine.
- Audit: `files.grant_add`, `files.grant_remove`.

## Development tree

`dev/files` is a committed fake tree (4 "volumes": media, documents, shared, backups — 240 files
in `backups/daily` for pagination), regenerated with `node scripts/dev/seed-files.mjs`. Run the
engine on it with `CANOPY_ROOT=<repo>/dev/files` (or `CANOPY_DATA_DIR=../dev/files` for the
compose stack).
