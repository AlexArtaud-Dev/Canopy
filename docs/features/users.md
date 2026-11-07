# Users (Administration › Users)

`/admin/users`, gated by `users:read`; actions need `users:create`, `users:update` or
`users:delete` (checked server-side with `authorize`, hidden in the UI with `useCan`).

- List: 20 per page, search on username, name and email (debounced 300 ms, kept in `?q=`),
  roles, status, 2FA, last activity.
- Create (username, name, optional email, initial password, roles), edit (name, email, roles —
  the username is fixed), reset password, reset two-factor, sign out everywhere, disable/enable,
  delete. Destructive actions ask for confirmation; resets and disabling end the user's sessions.
- Guards: admins manage their own account from `/account`, never here; nothing may leave Canopy
  without an active administrator (`users.last_admin`).
- Audit: `users.create`, `users.update`, `users.disable`, `users.enable`, `users.delete`,
  `users.password_reset`, `users.sessions_revoke`, `users.two_factor_reset`.
