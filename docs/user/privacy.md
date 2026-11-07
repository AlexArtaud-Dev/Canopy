# Privacy in Canopy

Canopy is self-hosted: your data stays on the server your administrator runs. It keeps only what it
needs to work.

## What Canopy stores about you

- **Account**: username, display name, optional email, preferred language, creation date.
- **Security**: a hashed password (never readable), whether two-factor is on (the secret is
  encrypted), your active sessions with their device and IP address.
- **Access**: your roles, groups and folder access rules.
- **Activity**: an audit log of what you changed, your sign-ins and refused attempts, with the IP
  address. Administrators use it for security; it is kept for a limited time (365 days by default).
- **Emails** sent to you (invitations, password resets, security notices), kept for a limited time
  (90 days by default).

Canopy does not read or store the contents of your files beyond what the folders you browse
contain, and it does not track you or share anything with third parties. The only optional outside
call is the breached-password check, which sends 5 characters of a hash, never your password.

## Your rights

- **See your data**: Account › Your data › "Download my data" gives you a JSON file of everything
  above. Administrators can export it for you.
- **Correct it**: change your display name and email on the Account page.
- **Delete it**: ask an administrator to delete your account. Your account, sessions, two-factor
  setup, roles, folder rules and emails are removed; audit entries keep only an anonymous id until
  their retention ends.
