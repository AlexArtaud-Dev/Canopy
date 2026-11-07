# Authentication

Local accounts only (Better Auth, username + password). No public sign-up.

- **First run**: with no account, every page leads to `/setup`. The wizard (language/theme →
  administrator → done) only runs from `CANOPY_LOCAL_NETWORKS`, once (advisory lock), and signs the
  new administrator in.
- **Passwords**: argon2id (19 MiB, t=2, p=1). Minimum length is `auth.passwordMinLength`
  (default 12). Optional breached-password check (`auth.checkBreachedPasswords`, off by default):
  Have I Been Pwned range API, only 5 hex chars of the SHA-1 leave the server; fails open.
- **Brute force**: 10 sign-ins per minute per IP, and an account locks after
  `auth.lockoutThreshold` failures (default 5) for `auth.lockoutMinutes` (default 15); a success
  clears its counter. Wrong username and wrong password get the same answer and the same timing.
- **Email is optional**: Better Auth needs a unique email, so `auth.users.email` holds an
  undeliverable `<uuid>@users.canopy.invalid`; the real address is `contact_email`.
- **Sessions**: httpOnly SameSite=Lax cookie (`canopy.session_token`, `__Secure-` on https).
  Settings `auth.sessionLifetimeDays` (absolute, default 30) and `auth.idleTimeoutMinutes`
  (default 7 days); activity is recorded every 5 minutes. Cookie signing key is derived from
  `CANOPY_ENCRYPTION_KEY` (HKDF).
- **Protection**: `proxy.ts` redirects requests without a session cookie (optimistic); layouts,
  pages and actions call `requireSession()`. Better Auth has no HTTP route: only our server actions
  call it, after validation, rate limiting and with our resolved client IP.
- **Audit**: `auth.setup`, `auth.sign_in` (success / denied with the attempted username),
  `auth.sign_out`.
