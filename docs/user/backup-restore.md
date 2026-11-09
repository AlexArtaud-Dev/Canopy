# Backup and restore

## What to save

| What                                 | Where                   | Why                                                                |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------ |
| `CANOPY_HOME/secrets`                | your Canopy folder      | Database passwords, the **encryption key** and the engine key pair |
| The database                         | `CANOPY_HOME/postgres`  | Accounts, groups, roles, folder access, settings, shares, audit    |
| Your files                           | the folders you mounted | Yours; include each mount's `.canopy-trash` to keep deleted items  |
| `docker/.env`, `docker/compose.yaml` | the Canopy folder       | Your settings and mounts                                           |
| Plugins (optional)                   | `CANOPY_HOME/plugins`   | Can also be reinstalled from Administration › Plugins              |

`CANOPY_HOME/cache` holds thumbnails only: no need to save it.

Without `secrets/encryption-key`, two-factor setups and the SMTP password in a database backup
cannot be read: keep the secrets with the database, ideally encrypted.

## Simplest: the whole folder, stopped

```bash
docker compose -f docker/compose.yaml --env-file docker/.env stop
tar -czf canopy-$(date +%F).tar.gz -C /srv/appdata canopy   # your CANOPY_HOME
docker compose -f docker/compose.yaml --env-file docker/.env start
```

Restore by putting the folder back in place (extract as root, so owners are kept) and starting
the stack.

## Without stopping: a database dump

```bash
docker compose -f docker/compose.yaml --env-file docker/.env exec -T postgres \
  pg_dump -U canopy_admin -d canopy --format=custom > canopy-$(date +%F).dump
cp -a /srv/appdata/canopy/secrets canopy-secrets-$(date +%F)
```

Run it from cron and copy both off the server.

### Restore a dump

On the same server or a new one, with the same release (see [Upgrade](upgrade.md)):

1. Put `docker/.env`, `docker/compose.yaml` and the file folders back, and copy the saved
   `secrets/` into the new `CANOPY_HOME` **before the first start** (otherwise new passwords are
   generated).
2. Start the database and load the dump:

   ```bash
   docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait postgres
   docker compose -f docker/compose.yaml --env-file docker/.env exec -T postgres \
     pg_restore -U canopy_admin -d canopy --clean --if-exists < canopy-2026-11-09.dump
   ```

3. Start the rest:

   ```bash
   docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
   ```

If a dump comes from an older release, start that release first, restore, then
[upgrade](upgrade.md): the newer containers update the database as they start.
