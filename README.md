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

> **Status: early development.** Accounts, administration and the engine core are in place; the
> file browser itself is being built. Not ready for production use.

## Why Canopy

- **Polished UX** — clean, responsive interface, keyboard and touch friendly, light and dark themes,
  English, French and Spanish.
- **Transparent long operations** — every long task is a job with live progress, cancel and a
  readable result.
- **Secure by design** — the interface never runs commands, every file access is confined to the
  root by the engine, every change is authorized on the server and written to the audit log.
- **Configurable** — deep administration with sensible defaults; nothing to set up to get started.

## Features

| Area           | What is there                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Accounts       | First-run setup wizard (local network only), sign-in, TOTP two-factor with recovery codes, sessions     |
| Protection     | Account lockout, address blocking, password policy, optional breached-password check                    |
| People         | Users, groups, roles with a permission matrix, two-factor required per group, invitations               |
| Folder access  | Allow/deny rules per user or group on any folder, resolved by the engine (deepest rule wins)            |
| Email          | SMTP from the admin UI, outbox with retries, invitation, password reset and security notices (en/fr/es) |
| Administration | Generated settings page, audit log viewer with CSV export, maintenance mode, color themes               |
| Privacy        | Personal data export, retention for audit events and emails ([privacy notes](docs/user/privacy.md))     |
| Coming next    | File browser, uploads and downloads, copy/move with live progress, trash, previews, search, sharing     |

## Quick start (Docker)

```bash
cp docker/.env.example docker/.env
# Fill the passwords and keys in docker/.env, then generate the engine key pair:
node scripts/dev/engine-keys.mjs >> docker/.env
docker compose -f docker/compose.yaml --env-file docker/.env up -d
```

Open <http://localhost:3000> from your local network: the setup wizard creates the first
administrator. Mount the folders to manage inside the engine root (see `docker/compose.yaml`).

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
