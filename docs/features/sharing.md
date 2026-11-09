# Share links

- **Create**: item menu › Share… (needs the `share` path action on the item). Choose the validity
  (up to the administrator's maximum), an optional password and an optional download limit. The
  link is shown once, ready to copy, and can be copied again from **Shares**.
- **Shares** page (`/shares`): your links with status (active, expired, revoked, limit reached),
  expiry and downloads; copy or revoke. People with `shares:manage` can switch to everyone's links
  (they can revoke them, not copy them).
- **Visitors** open `/s/<token>` without an account: password gate (10 tries per 15 minutes per
  link and address), then the file, or the folder with its subfolders, each item downloadable, and
  "Download all" as a zip. Download only: no preview, no upload, no change.
- **Settings** (module `shares`): default validity (7 days), longest validity (90 days), require
  a password (off).

## How it is secured

- The token is 32 random bytes. Only its SHA-256 is used for lookup; the token itself is stored
  sealed (encrypted) so owners can copy it again. Passwords are argon2id hashes. An unlocked
  browser keeps a sealed, HttpOnly cookie scoped to `/s` for at most 12 hours.
- The engine is the authority: the web app signs tokens for the **owner** with a share `scope`
  (`docs/dev/permissions.md` rule 7). A link never reaches more than what was shared, nor more than
  its owner may still read: if the owner loses access, the link stops working.
- Downloads: each click counts one download (atomically, so a limit cannot be overrun), then sets a
  stream ticket scoped to exactly that file or folder in the `canopy_share` cookie, path
  `/api/engine/share`. The relay's share channel only allows the download and zip routes, and the
  ticket never replaces a signed-in visitor's own.
- Audit: `shares.create`, `shares.revoke`, `shares.open` (each page view), `shares.unlock_failed`,
  `shares.download`, plus the engine's `fs.download` with `meta.share`.
