# Security

## Network & reverse proxy

- The app speaks HTTP behind a TLS-terminating reverse proxy (TLS 1.2+ enforced there).
  No reverse proxy config is shipped; deployment docs only list requirements.
- Real client IP: forwarded headers (`X-Forwarded-For`, `CF-Connecting-IP`) are honored only when
  the direct peer is in `CANOPY_TRUSTED_PROXIES`; XFF is walked right-to-left skipping trusted hops.
  Typical chain: Cloudflare → SWAG/Nginx → web.
  - Next.js does not expose the TCP peer to App Router code, and only fills XFF when the client
    sent none. `apps/web/server/peer-address.mjs` (loaded with `node --import`) stamps every
    request with `x-canopy-peer: <per-process nonce> <socket address>` through the
    `http.server.request.start` diagnostics channel; values without the nonce are ignored.
  - `getRequestContext()` resolves the client IP (`shared/request/client-ip.ts`). An unknown peer
    yields no IP: local-only features fail closed.
- An upstream SSO layer (e.g. Authelia) may sit in front; Canopy still requires its own login.
- Headers: strict CSP with nonces, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`. Secure cookies when the public URL is https.
  - `src/proxy.ts` mints a nonce and request ID per request; the CSP comes from
    `shared/security/csp.ts` (styles keep `'unsafe-inline'` for Radix positioning; `'unsafe-eval'`
    only in development). Static headers are set in `next.config.ts`. HSTS belongs to the TLS proxy.
  - The proxy matcher MUST exclude `/engine/*` and any upload route: matched requests get their
    body cloned and buffered (see streaming.md).
- The engine port is never published; it lives on the internal Docker network only.

## Maintenance / lockdown mode

- When enabled, any request whose real IP is outside `CANOPY_LOCAL_NETWORKS` receives only the
  static, translated maintenance page; every other route and `/engine/*` returns 503.
- Toggle from the admin UI (only from a local IP) or forced with `CANOPY_MAINTENANCE=true`.
- Implementation: `system.maintenance` setting (`localOnly`, env `CANOPY_MAINTENANCE`), read by
  `src/proxy.ts` (Node runtime) with a 5 s cache; the decision is pure
  (`shared/maintenance/maintenance.utils.ts`). Non-local visitors are rewritten to `/maintenance`
  (503), API calls get `system.maintenance` (503, `Retry-After`). If the database is unreachable the
  last known state is kept. Routes the proxy must not match (uploads under `/api/engine`) check the
  flag themselves.

## Authentication

- Local accounts only. argon2id hashing. Better Auth sessions in httpOnly, Secure, SameSite=Lax cookies.
- TOTP 2FA (optional, can be enforced per group) + recovery codes.
- Login rate limiting and lockout; password policy, session lifetime and idle timeout are settings.
- Users can list and revoke their sessions; admins can revoke anyone's.
- First-run setup wizard creates the first admin — only when no user exists and only from a local IP.

## Request hardening

- Rate limiting per IP and per user (stricter on auth endpoints) — settings.
  `enforceRateLimit(scope, subject, { limit, windowSeconds })` (`shared/rate-limit`) counts in
  Postgres with one atomic upsert (shared by every instance) and throws `system.rate_limited`
  with `retryAfter`.
- CSRF: origin check on server actions + SameSite cookies; engine endpoints use bearer tokens, not cookies.
  Next.js already rejects server actions whose `Origin` differs from the host.
- Strict CORS: same-origin only.
- All inputs Zod-validated (web) and re-validated (engine).

## Secrets & data at rest

- Encrypted with AES-256-GCM (`CANOPY_ENCRYPTION_KEY`, key-versioned envelope for rotation):
  session-adjacent tokens, TOTP secrets, API keys, plugin credentials, any setting flagged `sensitive`.
  - Use `sealSecret(value, purpose)` / `openSecret(envelope, purpose)` (`shared/secrets`). The
    purpose (`auth.totp:<userId>`) is authenticated data: a value copied elsewhere fails to open.
  - Envelope `v1.<keyId>.<iv>.<tag>.<ciphertext>`. Rotation: put the new key in
    `CANOPY_ENCRYPTION_KEY`, the old one in `CANOPY_ENCRYPTION_KEY_PREVIOUS`, re-encrypt values
    where `isSealedWithRetiredKey()` is true, then drop the old key.
- Passwords are hashed, never encrypted. Managed files are NOT encrypted by Canopy.
- Nothing sensitive in localStorage/sessionStorage; engine token kept in memory only, short-lived.

## Files served to browsers

- Upload size and type limits (settings), filename sanitization, uploaded files never executed.
- Previews served with correct `Content-Type`, `Content-Disposition`, and a sandbox CSP;
  HTML/SVG previewed sandboxed or as text.

## Audit log

- Append-only `audit.events`: id, timestamp, actorId, actorIp, action (`<module>.<action>`),
  target (virtual path or entity id), result (success/denied/error), requestId, meta (never file content).
- Covers every state change, auth events, admin/settings/permission changes and denied attempts.
- Retention configurable; viewer with filters in the admin UI.
- Write with `audit({ action, result, target, actorId, meta })` (`features/audit/server/audit-writer.ts`):
  request ID and client IP are added automatically; actions must be declared in the module's
  `auditActions`. If the insert fails the calling action fails — no unaudited change.
- `meta` is sanitized (secret-looking keys redacted, strings/arrays/depth truncated, 8 KiB cap).
  Sensitive setting values are never passed at all.
- Append-only is enforced in Postgres: a trigger rejects UPDATE and TRUNCATE, and DELETE unless
  the purge transaction runs `SET LOCAL canopy.audit_purge = 'on'`.

## RGPD

- Minimal personal data (username, optional email, IPs in audit). Retention configurable.
- Admin can export and delete a user's personal data. Documented in the user docs.

## Supply chain

- Renovate/Dependabot, `pnpm audit`, `govulncheck` in CI; base images pinned by digest.
