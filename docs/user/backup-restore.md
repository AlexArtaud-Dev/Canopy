# Backup and restore

## What to save

| What                  | Where                         | Why                                                                 |
| --------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `docker/.env`         | the Canopy folder             | Database passwords, the **encryption key** and the engine key pair  |
| The database          | `postgres-data` Docker volume | Accounts, groups, roles, folder access, settings, shares, audit log |
| Your files            | the folders you mounted       | Yours; include each mount's `.canopy-trash` to keep deleted items   |
| `docker/compose.yaml` | the Canopy folder             | If you added mounts or variables                                    |
| Plugins (optional)    | `CANOPY_PLUGINS_DIR`          | Can also be reinstalled from Administration › Plugins               |

`CANOPY_CACHE_DIR` holds thumbnails only: no need to save it.

Without the encryption key, two-factor secrets and the SMTP password in a database backup cannot
be read: keep `docker/.env` with the database dump, ideally encrypted.

## Back up the database

While Canopy runs:

```bash
docker compose -f docker/compose.yaml --env-file docker/.env exec -T postgres \
  pg_dump -U canopy_admin -d canopy --format=custom > canopy-$(date +%F).dump
```

Run it from cron for regular backups and copy the files off the server.

## Restore

On the same server or a new one, with the same release (see [Upgrade](upgrade.md)):

1. Put `docker/.env` and `docker/compose.yaml` back, and the file folders at their mount points.
2. Start the database alone and load the dump:

   ```bash
   docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait postgres
   docker compose -f docker/compose.yaml --env-file docker/.env exec -T postgres \
     pg_restore -U canopy_admin -d canopy --clean --if-exists < canopy-2026-11-09.dump
   ```

3. Start the rest:

   ```bash
   docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
   ```

On a new server the database volume is new, so the first start creates the two app roles with
the passwords from `docker/.env` before you restore; keep the same `.env` and they match.

If a dump comes from an older release, start that release first, restore, then
[upgrade](upgrade.md): the newer containers update the database as they start.
