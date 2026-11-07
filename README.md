# Canopy

A self-hosted web file manager, built from scratch as a successor to FileBrowser.

- **Polished UX** — fast browsing of large directories, keyboard and touch friendly.
- **Transparent long operations** — live progress, cancel and readable results for every job.
- **Secure by design** — no shell from the UI, root-confined filesystem access, audited actions.
- **Configurable** — deep admin settings with sensible defaults.

> Status: early development. Not ready for production use.

## Stack

Next.js web app (`apps/web`) · Go engine (`apps/engine`) · OpenAPI contract
(`packages/contracts`) · PostgreSQL · pnpm workspaces.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the contributor rules in [`docs/dev/`](docs/dev/).

## License

[AGPL-3.0](LICENSE)
