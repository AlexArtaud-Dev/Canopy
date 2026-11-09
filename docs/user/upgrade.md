# Upgrade

Versions follow the calendar: `2026.11.0` is the first release of November 2026, `2026.11.1` the
next one. There is no automatic update.

## Steps

1. Read the release notes on the
   [releases page](https://github.com/AlexArtaud-Dev/Canopy/releases) (also in the app after the
   upgrade: account menu › What's new).
2. [Back up](backup-restore.md) the database and `docker/.env`.
3. Take the new release's `docker/` folder if the notes say it changed
   (`git fetch --tags && git checkout v2026.12.0`, or unpack the new archive and copy your
   `docker/.env` across).
4. Set `CANOPY_VERSION=2026.12.0` in `docker/.env`, then:

   ```bash
   docker compose -f docker/compose.yaml --env-file docker/.env pull
   docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
   ```

Database changes run by themselves when the new containers start; `--wait` returns once both
apps are healthy. People signed in keep their session.

## Pinning

Keep `CANOPY_VERSION` on a version number rather than `latest`, so a restart or a `pull` never
upgrades behind your back.

## Going back

Database changes only go forward. To return to an older version, restore the backup taken before
the upgrade (database **and** `docker/.env`) and set `CANOPY_VERSION` back.
