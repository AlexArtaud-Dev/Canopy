# Troubleshooting

## Reading the logs

```bash
docker compose -f docker/compose.yaml --env-file docker/.env ps
docker compose -f docker/compose.yaml --env-file docker/.env logs --tail 100 web engine
```

Logs are JSON lines. Error pages in the app show a **reference** (request id): search the logs
for it to find what happened. Logs never contain passwords, tokens or file contents.

## The setup wizard says it is only available from the local network

It answers addresses in `CANOPY_LOCAL_NETWORKS` only. Open it from a computer on your LAN. Behind
a reverse proxy, also set `CANOPY_TRUSTED_PROXIES` (see [Reverse proxy](reverse-proxy.md)),
otherwise Canopy sees the proxy instead of you.

## Signing in does nothing / I am signed out right away

`CANOPY_PUBLIC_URL` starts with `https://` but the site is opened over plain HTTP: the browser
drops the Secure session cookie. Open the `https://` address, or fix the variable.

## A container is unhealthy

- **engine** right after start: wrong database password, or `CANOPY_ENGINE_PUBLIC_KEY` missing.
  Its log says which.
- **web**: same for its own variables; `CANOPY_ENCRYPTION_KEY` must decode to 32 bytes.
- Both depend on **postgres**: check it first.

## Everything says "access denied"

Folders are invisible until someone is given access: Administration › Groups (or Users) › Folder
access. Administrators see everything.

## Files cannot be created, renamed or uploaded ("permission denied")

The engine runs as `PUID:PGID`. The mounted folder must be writable by that user:
`ls -ln /mnt/disk1`, then `chown` or change `PUID`/`PGID` (see
[Configuration](configuration.md#owner-of-new-files-puid-pgid-umask)). A folder mounted `:ro` is
read-only on purpose.

## Uploads fail or stop at the same size

The reverse proxy limits request bodies: allow at least 40 MB and turn request buffering off.

## Progress bars do not move / operations seem stuck until the page is reloaded

The reverse proxy buffers responses: turn response buffering off and raise its read timeout to
15 minutes. Operations keep running on the server either way; see them in the Operations panel.

## Locked out by maintenance mode

Maintenance mode only lets the local network in. From the LAN, Administration › Configuration ›
Settings › System turns it off. If that is not possible, set `CANOPY_MAINTENANCE=false` on the
`web` service and restart it.

## An administrator lost their two-factor device

They can sign in with one of their recovery codes. Otherwise another administrator turns their
two-factor off from Administration › Users. With a single administrator and no recovery code,
restore a database backup from before two-factor was set up.

## Video thumbnails are missing

The default engine image has no `ffmpeg`, so videos keep their icon; images still get
thumbnails.
