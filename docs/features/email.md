# Email (Administration › Email)

- **Settings** (`/admin/email`, `mail:read` / `mail:update`): enable, SMTP host, port, encryption
  (STARTTLS, implicit TLS, none), username, password (encrypted at rest, never sent back to the
  browser — empty keeps it), sender address and name. Every field can be forced by an env var
  (`CANOPY_SMTP_ENABLED|HOST|PORT|SECURITY|USERNAME|PASSWORD|FROM|FROM_NAME`) and then shows as
  locked. Changes go through the settings store (audited `settings.update`, value hidden for the
  password).
- **Test**: sends a translated test email; the outcome is audited (`mail.test_send`).
- **Outbox** (`app.mail_outbox`): every email is written first, sent right away when possible,
  otherwise retried by a per-minute sweep (1, 5, 30, 120, 360 minutes, then `failed`). Failures are
  stored as translatable codes (`mail.auth_failed`, `mail.connection_failed`…), never raw server
  text. The page lists the last 50 messages.
- **Templates** (`features/mail/templates`): one branded layout (inline styles, tables) with a
  plain-text alternative; every value HTML-escaped; texts from `messages/<locale>/emails.json`,
  rendered in the recipient's locale.

## Flows

- **Invitation**: "New user" can send an invitation instead of setting a password (email required).
  The link (`/set-password?token=`, 7 days, one use) is emailed, or shown to the administrator to
  copy when email is off or fails.
- **Forgot password** (`/forgot-password`, linked from sign-in): by username or email, rate-limited
  per address, same answer whether or not an account matched; reset links last 1 hour. Admins can
  also "Send a reset link" from the users table (24 hours, copyable fallback).
- **Links**: 32 random bytes, only their SHA-256 stored (`auth.action_tokens`), a new link revokes
  the previous one of the same kind; setting a password signs the account out everywhere.
- **Security notices** (to the account's own email, in its last UI language): password changed,
  two-factor on/off, sign-in from a new device or address (`auth.notifyNewSignIn`, default on).
  Notices never block the action that triggered them.
