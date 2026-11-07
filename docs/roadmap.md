# Canopy roadmap (to v1)

Status: **approved 2026-11-07**. M1 (foundations) is done. Each milestone ships as small PRs
(one issue each, squash-merged with green CI). Order matters: each milestone only depends on the
ones before it.

| #   | Milestone                         | Outcome for users                                           |
| --- | --------------------------------- | ----------------------------------------------------------- |
| M2  | Platform core                     | Nothing visible yet: DB, settings, audit, security plumbing |
| M3  | Authentication                    | Setup wizard, login/logout, 2FA, own account and sessions   |
| M4  | Users, groups, roles, permissions | Admins manage people and what they can do                   |
| M5  | Email                             | Invitations, password reset, security notifications         |
| M6  | Administration & compliance       | Settings UI, audit viewer, maintenance mode, RGPD tools     |
| M7  | Engine core                       | Secure engine access, path grants, listing API, jobs + SSE  |
| M8  | File manager                      | Browse, upload, download, copy/move with progress, trash    |
| M9  | Viewing & finding                 | Previews, thumbnails, media streaming, search, archives     |
| M10 | Sharing                           | Expiring share links                                        |
| M11 | Commands & plugins                | Advanced mode, command catalog, plugin install (mrename)    |
| M12 | Release & v1                      | Release pipeline, What's new, docs, audits, v1              |

---

## M2 — Platform core

Everything later milestones build on. No new pages except error states.

1. **Database & request context (web)** — Drizzle with the `canopy_web` role (`auth`, `app`,
   `audit` schemas), migrations applied at boot, typed DB client in `shared/db`. Request context:
   `requestId`, real client IP (`CANOPY_TRUSTED_PROXIES`, XFF walked right-to-left), child logger.
2. **Errors & UI states** — `AppBaseError` → `{ code, params, requestId }` mapping, `errors.*`
   translations, error boundary per route segment with copyable request ID, not-found page.
3. **Encryption at rest** — AES-256-GCM envelope with key version (`CANOPY_ENCRYPTION_KEY`),
   rotation-ready; used for TOTP secrets, SMTP password, any `sensitive` setting.
4. **Module registry** — `CanopyModule` interface, registry, nav entries and audit labels derived
   from it; existing `shell`/`system` slices migrated.
5. **Settings framework** — Zod definitions with defaults, `app.settings` storage, typed
   `getSettings(module)`, in-memory cache invalidated by Postgres `NOTIFY`, env overrides shown
   read-only. Engine-consumed settings as JSON Schema in `packages/contracts/settings/` → Zod + Go.
6. **Audit log** — append-only `audit.events` (engine role: INSERT only), `audit()` writer used by
   every server action, actions declared in module manifests.
7. **Security baseline** — `proxy.ts` (matcher excludes `/engine/*`, see streaming.md): CSP with
   nonces, `frame-ancestors 'none'`, nosniff, Referrer/Permissions-Policy; same-origin checks on
   server actions; rate limiter (per IP / per user, Postgres-backed) reused by auth.

## M3 — Authentication

1. **Better Auth core** — username + password (email optional), argon2id hashing, httpOnly Secure
   SameSite=Lax cookies, session lifetime / idle timeout from settings, protected routes, login and
   logout pages, auth events audited.
2. **First-run setup wizard** — only when no user exists and only from a local IP: create the first
   admin, pick default language/theme. Stepper component (`shared/ui/stepper`).
3. **Brute-force protection** — stricter rate limits on auth, lockout (5 attempts / 15 min),
   password policy (length, breached-password check optional — decision below).
4. **TOTP 2FA** — enrolment with QR code, recovery codes (one-time, hashed), encrypted secrets,
   step-up on sensitive actions; enforcement per group lands in M4.
5. **My account** — profile (display name, email, locale, theme saved server-side), change
   password, active sessions with revoke ("sign out everywhere").

## M4 — Users, groups, roles & global permissions

1. **Authorization core** — groups, memberships, roles, role assignments; permission registry built
   from module manifests; `authorize(ctx, '<module>:<action>')` server guard; `<Can>` UI helper;
   built-in roles `Admin`, `Editor`, `Viewer` seeded (editable); `system:admin`.
2. **Admin › Users** — paginated list with debounced search, create (or invite in M5), edit,
   disable/enable, delete, reset password, revoke sessions, reset 2FA. Every change audited.
3. **Admin › Groups & roles** — CRUD, members, permission matrix generated from the registry
   (roles × actions), 2FA enforcement per group.
4. **Admin area shell** — "Administration" navigation filtered by permissions, permission-denied
   states, E2E: permission denial path.

## M5 — Email

1. **Mail transport** — SMTP settings (host, port, TLS mode, user, encrypted password, sender),
   "send test email", outbox table with retries and status, audit. Works without SMTP: flows fall
   back to admin-copied one-time links.
2. **Templates** — branded HTML + plain-text, en/fr/es, rendered in the recipient's locale.
3. **Flows** — invitation (set-password link), password reset, email change verification,
   security notifications (password changed, 2FA enabled/disabled, new device sign-in — setting).

## M6 — Administration & compliance

1. **Settings UI** — generated from schemas: search, groups, "modified" badge, reset to default,
   env-locked fields read-only, `localOnly` fields editable only from a local IP.
2. **Audit viewer** — filters (actor, action, result, date, target), pagination, CSV export,
   retention purge job.
3. **Maintenance / lockdown mode** — translated static page for non-local IPs, 503 on everything
   else including `/engine/*`; toggle from admin (local IP only) or `CANOPY_MAINTENANCE=true`.
4. **RGPD** — export a user's personal data (JSON), delete/anonymize a user, retention settings,
   user-facing privacy notes in the docs.
5. **Appearance** — color theme registry (`data-theme` token files), default theme/locale settings.

## M7 — Engine core

1. **Engine access** — web issues short-lived Ed25519 JWTs (`sub`, `sid`, `perms[]`, `exp ≤ 5 min`);
   engine verifies; `/engine/*` Pages API stream proxy (spike variant D) injects the token.
2. **Path safety** — virtual POSIX paths, validation (NUL, UTF-8, absolute), `os.Root` resolver,
   host paths never leave the engine.
3. **Path grants** — tables in `app`, pure `authz` resolution in Go (deepest wins, deny beats allow,
   user beats group, default deny) with ≥ 90 % coverage, per-entry capabilities in responses.
4. **Listing API** — list/stat with pagination and sorting, contract-first, 10k-entry budget.
5. **Jobs** — River queue in `river` schema, job model and states, throttled progress persisted,
   `LISTEN/NOTIFY` → SSE through the proxy, cancel (SIGTERM → SIGKILL), capped logs, concurrency
   limits and per-user caps from settings.

## M8 — File manager

1. **Browser** — list and grid views (TanStack Virtual), breadcrumbs, sorting, selection,
   keyboard navigation, `?` shortcuts dialog, context menu (right-click + long-press), empty/error
   states, first paint < 300 ms on 10k entries.
2. **Jobs dock** — persistent panel: progress, speed, ETA, current file, cancel, retry, completion
   notification, expandable output (advanced mode).
3. **Basic operations** — new folder, rename, copy, move (pre-scan conflicts → skip / overwrite /
   keep both / per item; cross-volume copy + verify + delete; disk-space check), "Move to…" for
   keyboard/touch, drag & drop.
4. **Upload & download** — resumable uploads (tus via `tusd` in the engine) with size/type limits,
   folder upload, single-file download with Range, zip/tar streaming of selections.
5. **Trash** — delete → `.canopy-trash` per volume, restore, empty, retention purge job, bypass
   threshold with a strong warning, Undo toast.
6. **Path grants editor** — folder picker, grant list per subject, "effective access" explainer.

## M9 — Viewing & finding

1. **Previews** — images, PDF, text/code (syntax highlighting), audio/video streaming with Range;
   sandboxed rendering for HTML/SVG; correct `Content-Type` / `Content-Disposition`.
2. **Thumbnails** — generated by the engine, cached (engine schema + disk), setting to disable;
   video frames via the command catalog (ffmpeg) if installed.
3. **Search** — filename search within accessible paths, debounced, paginated (approach below).
4. **Archives & checksums** — compress/extract (zip, tar.gz) and checksum as jobs.

## M10 — Sharing

Share links for files/folders: expiry (default 7 days), optional password, download count/limit,
revoke, list of my shares and all shares (admin), public share page (preview + download), every
access audited.

## M11 — Commands & plugins

1. **Command catalog & runner** — YAML catalog, typed params, argv templates, `exec` without shell,
   scrubbed env, PUID:PGID + nice/ionice, output parsers (`rsync-progress2`, `percent-regex`,
   `line-count`, `none`), secrets redaction.
2. **Advanced mode** — global setting + `commands:advanced` permission, generated parameter forms,
   read-only argv preview, dry-run, live output.
3. **Plugins** — `canopy-plugin.yaml`, install from allowlisted GitHub releases, mandatory SHA-256,
   pin/update/enable/disable/uninstall, release notes, `docs/integrations/writing-a-plugin.md`.
4. **mrename** — reference plugin (**blocked**: needs its CLI arguments documented and release
   binaries published).

## M12 — Release & v1

1. **Release pipeline** — manual "Release" workflow: CalVer, changelog move, version bump PR; on
   merge: tag, GitHub Release from YAML, multi-arch images (amd64, arm64) on GHCR.
2. **What's new** — in-app changelog by version and type in the user's locale, "new since last
   visit" badge, Unreleased section on dev builds.
3. **User documentation** — install, upgrade, backup/restore, reverse proxy requirements,
   volumes, PUID/PGID, troubleshooting, privacy.
4. **Hardening pass** — accessibility audit (WCAG 2.2 AA), performance budgets check, security
   review, Playwright coverage of every critical path (login + 2FA, browse, upload, copy/move with
   progress, delete → trash → restore, permission denial).
5. **v1.0** release.

---

## Decisions

Libraries added beyond the decided stack (approved 2026-11-07):

| Need                     | Choice                                          | Rejected                         |
| ------------------------ | ----------------------------------------------- | -------------------------------- |
| argon2id hashing         | `@node-rs/argon2` (prebuilt incl. musl)         | `argon2` (node-gyp), `hash-wasm` |
| Sending email            | `nodemailer` (SMTP)                             | provider SDKs (lock-in)          |
| Email templates          | plain TS functions + shared layout              | `react-email` (heavier)          |
| Engine token (JWT EdDSA) | `jose` (web) + `golang-jwt/jwt/v5` (engine)     | hand-rolled JWT                  |
| QR code for 2FA          | `qrcode` (server-rendered SVG)                  | client-side rendering            |
| Drag & drop              | `@dnd-kit/core` (keyboard + touch)              | native HTML5 DnD                 |
| Code highlighting        | `shiki` (lazy-loaded)                           | `prism-react-renderer`           |
| Breached passwords       | optional HIBP k-anonymity check, off by default | always on (needs egress)         |

Product decisions:

1. **Sign-up** — no public registration: accounts are created or invited by an admin.
2. **Email** — optional per user; email flows run only when the user has an email and SMTP is
   configured, otherwise admins share one-time links.
3. **Search** — v1 walks the tree with limits (depth, count, timeout); an index can come later.
4. **Share links** — download only in v1.
5. **mrename** — open: CLI arguments and release binaries still needed before M11.4.
