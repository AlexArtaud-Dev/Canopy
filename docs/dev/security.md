# Security

## Network & reverse proxy

- The app speaks HTTP behind a TLS-terminating reverse proxy (TLS 1.2+ enforced there).
  No reverse proxy config is shipped; deployment docs only list requirements.
- Real client IP: forwarded headers (`X-Forwarded-For`, `CF-Connecting-IP`) are honored only when
  the direct peer is in `CANOPY_TRUSTED_PROXIES`; XFF is walked right-to-left skipping trusted hops.
  Typical chain: Cloudflare → SWAG/Nginx → web.
- An upstream SSO layer (e.g. Authelia) may sit in front; Canopy still requires its own login.
- Headers: strict CSP with nonces, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`. Secure cookies when the public URL is https.
- The engine port is never published; it lives on the internal Docker network only.

## Maintenance / lockdown mode

- When enabled, any request whose real IP is outside `CANOPY_LOCAL_NETWORKS` receives only the
  static, translated maintenance page; every other route and `/engine/*` returns 503.
- Toggle from the admin UI (only from a local IP) or forced with `CANOPY_MAINTENANCE=true`.

## Authentication

- Local accounts only. argon2id hashing. Better Auth sessions in httpOnly, Secure, SameSite=Lax cookies.
- TOTP 2FA (optional, can be enforced per group) + recovery codes.
- Login rate limiting and lockout; password policy, session lifetime and idle timeout are settings.
- Users can list and revoke their sessions; admins can revoke anyone's.
- First-run setup wizard creates the first admin — only when no user exists and only from a local IP.

## Request hardening

- Rate limiting per IP and per user (stricter on auth endpoints) — settings.
- CSRF: origin check on server actions + SameSite cookies; engine endpoints use bearer tokens, not cookies.
- Strict CORS: same-origin only.
- All inputs Zod-validated (web) and re-validated (engine).

## Secrets & data at rest

- Encrypted with AES-256-GCM (`CANOPY_ENCRYPTION_KEY`, key-versioned envelope for rotation):
  session-adjacent tokens, TOTP secrets, API keys, plugin credentials, any setting flagged `sensitive`.
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

## RGPD

- Minimal personal data (username, optional email, IPs in audit). Retention configurable.
- Admin can export and delete a user's personal data. Documented in the user docs.

## Supply chain

- Renovate/Dependabot, `pnpm audit`, `govulncheck` in CI; base images pinned by digest.
