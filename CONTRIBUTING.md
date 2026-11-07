# Contributing to Canopy

Thanks for helping! Canopy is licensed under AGPL-3.0; by contributing you agree your work is
released under the same license.

## Prerequisites

Node.js ≥ 22.12 (CI uses the version in `.node-version`), pnpm 12 (pinned in `package.json` →
`packageManager`; run `pnpm self-update 12` if needed), Go (version in `apps/engine/go.mod`),
Docker + Docker Compose.

## Getting started

```bash
pnpm install
docker compose -f docker/compose.dev.yaml up -d
pnpm dev
```

## Workflow

1. Open or pick an issue; discuss larger changes first.
2. Branch from `main`: `feat/short-description` (see `docs/dev/git-and-release.md`).
3. Follow the rules in `docs/dev/` for the area you touch.
4. Add a changelog entry in `changelog/unreleased.yaml` (en/fr/es).
5. Open a PR referencing the issue (`Closes #N`) and complete the checklist.

## Writing an integration

See `docs/integrations/` (plugin manifest, catalog entries, release requirements).
