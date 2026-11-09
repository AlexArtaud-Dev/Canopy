<p align="center">
  <img src="docs/assets/logo.svg" alt="Canopy logo" width="96" height="96">
</p>

<h1 align="center">Canopy</h1>

<p align="center">
  A self-hosted web file manager, built from scratch as a successor to FileBrowser.
</p>

<p align="center">
  <a href="https://github.com/AlexArtaud-Dev/Canopy/actions/workflows/ci.yml"><img src="https://github.com/AlexArtaud-Dev/Canopy/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
</p>

> **Status: release candidate for v1.** Everything below works; the v1 hardening pass is under way.

## Why Canopy

- **Polished UX** — clean, responsive interface, keyboard and touch friendly, light and dark themes,
  English, French and Spanish.
- **Transparent long operations** — every long task is a job with live progress, cancel and a
  readable result.
- **Secure by design** — the interface never runs commands, every file access is confined to the
  root by the engine, every change is authorized on the server and written to the audit log.
- **Configurable** — deep administration with sensible defaults; nothing to set up to get started.

## Features

| Area           | What is there                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Files          | Fast list and grid views (10k+ entries), search, previews (images, video, PDF, code), thumbnails     |
| Operations     | Resumable uploads, downloads and zips, copy/move with live progress and cancel, archives, checksums  |
| Safety         | Trash with restore, confirmation and undo for destructive actions, audit of every change             |
| Sharing        | Share links (expiry, password, download limit) and upload links (file types, size limits)            |
| Commands       | Catalog of tools run with typed options, never a shell; plugins such as mrename from GitHub releases |
| Accounts       | First-run setup wizard (local network only), TOTP two-factor with recovery codes, sessions           |
| People         | Users, groups, roles with a permission matrix, folder access rules per user or group, invitations    |
| Administration | Settings with sensible defaults, email (SMTP), audit log viewer with CSV export, maintenance mode    |
| Privacy        | Personal data export, retention for audit events and emails ([privacy notes](docs/user/privacy.md))  |
| Languages      | English, French and Spanish; light and dark themes                                                   |

## Install

```bash
git clone --branch <latest release tag> --depth 1 https://github.com/AlexArtaud-Dev/Canopy.git canopy
cd canopy && cp docker/.env.example docker/.env   # set CANOPY_HOME, PUID/PGID and your folders
docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
```

The [user guide](docs/user/README.md) covers install, folders and PUID/PGID, reverse proxy,
upgrades, backups and troubleshooting.

## Architecture

| Part                 | Technology                                                                   |
| -------------------- | ---------------------------------------------------------------------------- |
| `apps/web`           | Next.js (App Router), TypeScript, shadcn/ui, next-intl, Better Auth, Drizzle |
| `apps/engine`        | Go: root-confined filesystem (`os.Root`), path grant resolution, jobs        |
| `packages/contracts` | OpenAPI 3.1, the single source of truth for generated Go and TypeScript code |
| Database             | PostgreSQL, one role per app                                                 |

The web app is the only public entry point; the engine lives on the internal network and accepts
only short-lived tokens signed by the web app. Details in [`docs/dev/`](docs/dev/).

## Development

```bash
pnpm install
docker compose -f docker/compose.dev.yaml --env-file docker/.env up -d   # PostgreSQL
pnpm dev
```

A fake tree of files for development lives in `dev/files` (`node scripts/dev/seed-files.mjs`
regenerates it). Lint, type checks and tests: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`make -C apps/engine lint test`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), the contributor rules in [`docs/dev/`](docs/dev/) and the
[roadmap](docs/roadmap.md).

## License

[AGPL-3.0](LICENSE)
