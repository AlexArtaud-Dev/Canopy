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

Only the `docker/` folder is used at run time; the images come from GitHub's registry
(`ghcr.io/alexartaud-dev/canopy-web` and `canopy-engine`). They are also on Docker Hub as
`izoniks/canopy:<version>-web` and `izoniks/canopy:<version>-engine`: to use those, set the two
`image:` lines in `docker/compose.yaml` accordingly.

**Videos**: the default engine image has no ffmpeg. For video thumbnails and in-browser playback
of videos the browser cannot read by itself (most MKV files: HEVC, AC-3, DTS…), use the engine
image with ffmpeg instead: `ghcr.io/alexartaud-dev/canopy-engine-ffmpeg` or
`izoniks/canopy:<version>-engine-ffmpeg` (about 160 MB instead of 23 MB). Both include 7-Zip
(7z, RAR and ISO archives).

**NVIDIA GPU**: the `engine-gpu` image (`ghcr.io/alexartaud-dev/canopy-engine-gpu` or
`izoniks/canopy:<version>-engine-gpu`, about 550 MB) converts videos on an NVIDIA GPU (NVENC):
the CPU stays almost idle. It needs the NVIDIA driver and the NVIDIA Container Toolkit on the host
(already there if Jellyfin or Plex use the GPU), and these lines on the `engine` service:

```yaml
    image: izoniks/canopy:${CANOPY_VERSION:-latest}-engine-gpu
    runtime: nvidia
    environment:
      NVIDIA_VISIBLE_DEVICES: all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

The engine tries a short encode on the GPU when it starts and logs
`"video conversion" … "encoder":"nvenc"` when it works, `"cpu"` otherwise (it then converts on
the CPU, as the other images do). `CANOPY_VIDEO_ENCODER=cpu` keeps the GPU out of it.

## 2. Configure

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` (there is no password or key to write: Canopy generates them):

1. `CANOPY_HOME`: one folder for everything Canopy keeps (database, generated secrets, thumbnails,
   plugins), for example `/srv/appdata/canopy`.
2. `PUID`/`PGID`: the host user that should own new files (`id -u` and `id -g`).
3. `CANOPY_DATA_DIR`, or your own mounts: the folders to manage (see
   [Configuration](configuration.md#folders)).
4. `CANOPY_PUBLIC_URL`: the address people open, and `CANOPY_VERSION`: the release (or `latest`).

## 3. Start

```bash
docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
```

The first start downloads the images, then two short steps run before the apps:

- **setup** creates `postgres/`, `secrets/`, `cache/` and `plugins/` in `CANOPY_HOME` with the
  right owners, and generates the database passwords, the encryption key and the engine key
  pair into `secrets/` (each file readable only by the service that uses it);
- **setup-db** creates the database roles and schemas.

Both run again on every start and keep what exists. `--wait` returns once everything is healthy.

**Back up `CANOPY_HOME`** (see [Backup and restore](backup-restore.md)): without
`secrets/encryption-key`, two-factor setups and the SMTP password cannot be read.

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
