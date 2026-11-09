# Install

Canopy runs as three containers: **web** (the interface), **engine** (all file access) and
**postgres**. Only `web` is reachable; the engine and the database sit on an internal network
with no way out.

## Requirements

- Linux on amd64 or arm64 (a NAS, a mini PC or a Raspberry Pi 4/5 all work).
- Docker Engine 28 or later with the Compose plugin v2.33 or later (`docker compose version`).
- 1 GB of free RAM, a few hundred MB of disk for the images and the database.
- For access from outside your network: a domain name and a reverse proxy with HTTPS
  (see [Reverse proxy](reverse-proxy.md)).

## 1. Get the files

Download the release you want from the
[releases page](https://github.com/AlexArtaud-Dev/Canopy/releases) (the source archive), or:

```bash
git clone --branch v2026.11.0 --depth 1 https://github.com/AlexArtaud-Dev/Canopy.git canopy
cd canopy
```

Only the `docker/` folder is used at run time; the images come from GitHub's registry.

## 2. Configure

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env`:

1. Replace the three database passwords with long random values.
2. Set `CANOPY_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. **Keep a copy
   somewhere safe**: two-factor secrets and the SMTP password are encrypted with it.
3. Generate the key pair the web app uses to sign its requests to the engine:

   ```bash
   docker run --rm -v "$PWD/scripts/dev:/keys:ro" node:24-alpine node /keys/engine-keys.mjs >> docker/.env
   ```

   (or `node scripts/dev/engine-keys.mjs >> docker/.env` if Node.js is installed), then delete the
   two empty `CANOPY_ENGINE_*_KEY=` lines above the new ones.

4. Set `PUID`/`PGID` to the host user that should own new files (`id -u` and `id -g`), and
   `CANOPY_VERSION` to the release you downloaded (or keep `latest`).
5. Point `CANOPY_DATA_DIR` at the folder to manage, or add your own mounts (see
   [Configuration](configuration.md#folders)).

## 3. Start

```bash
mkdir -p docker/cache docker/plugins
docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
```

The first start downloads the images and prepares the database; `--wait` returns once every
container is healthy.

## 4. Create the administrator

Open <http://localhost:3000> (or `http://<server-ip>:3000` after setting `CANOPY_HTTP_BIND`)
**from your local network**: the setup wizard only answers local addresses, so nobody on the
internet can claim your server. It creates the first administrator; turn on two-factor
authentication right after (Account › Security).

Then, from **Administration**:

- **Users** / **Groups** / **Roles**: invite people and decide what they may do.
- **Groups › Folder access**: grant folders (nobody but administrators sees anything until then).
- **Configuration › Email**: SMTP, for invitations and password resets.
- **Configuration › Settings**: everything else, with sensible defaults.
