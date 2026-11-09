# Git, CI & releases

## Branches

- `main` only long-lived branch: protected, PR-only, squash merge, linear history.
- Work branches: `<type>/<kebab-description>` with type in `feat, fix, chore, refactor, docs, perf, test, ci`.

## Commits

```
feat(files): add live progress for cross-volume moves

- Stream byte-level progress from the engine over SSE
- Add cancel with cleanup of partial copies
```

- Conventional Commits, English, imperative summary ≤ 72 chars, scope = slice or app.
- Body: high-level bullets, no deep granularity.
- No AI attribution of any kind (no trailers, no mentions).

## Pull requests

- Title mirrors the commit summary; body mirrors its bullets.
- Every PR body references at least one issue with a closing keyword: `Closes #42`.
- Screenshots/GIFs for UI changes; DoD checklist from the PR template; type + area labels.

## CI (GitHub Actions, on every PR)

lint (ESLint, golangci-lint) · typecheck · contracts drift · i18n key check · changelog check
(entry or `no-changelog` label) · unit tests + coverage gates · Playwright on the compose stack ·
Docker build · `pnpm audit` + `govulncheck`.

All jobs live in `.github/workflows/ci.yml` and are required checks on `main`. Run them locally:

| Check                   | Command                                                         |
| ----------------------- | --------------------------------------------------------------- |
| Format, lint, typecheck | `pnpm format:check && pnpm lint && pnpm typecheck`              |
| Unit tests + coverage   | `pnpm test` · `make -C apps/engine test cover-gate` (Go ≥ 90 %) |
| i18n parity             | `pnpm check:i18n` (missing/extra keys, placeholder mismatches)  |
| Changelog schema        | `pnpm check:changelog`                                          |
| Contracts drift         | `pnpm contracts:gen && git diff --exit-code`                    |
| E2E                     | start `docker/compose.yaml`, then `pnpm test:e2e`               |

Dependabot opens weekly grouped updates for npm, Go modules, Docker base images and actions.

## CalVer

- Format `YYYY.MM.MICRO`, no zero padding (`2026.11.0`, `2026.11.1`, `2026.12.0`), tags `v2026.11.0`.
  MICRO resets every month. SemVer-compatible for npm/Docker tooling.

## Release flow (no automatic CD)

1. Actions → **Release** → Run workflow (on `main`). `scripts/release/prepare.mjs` computes the next
   CalVer from `changelog/releases/`, moves `changelog/unreleased.yaml` to
   `changelog/releases/<version>.yaml` (with its date), empties Unreleased and sets
   `apps/web/package.json` `version`. The commit is created through GitHub's API
   (`push-commit.mjs`), so it is signed as `main` requires, and a `chore(release): <version>` PR
   opens with the notes.
   - Add a `RELEASE_TOKEN` secret (fine-grained: contents + pull requests write) so CI starts on that
     PR; without it, close and reopen the PR to run the checks.
2. Merging it runs **Publish**: tag `v<version>`, GitHub Release (notes from the YAML,
   `notes.mjs`), multi-arch images (amd64, arm64) pushed to GHCR (`canopy-web`, `canopy-engine`)
   as `<version>` and `latest`. `docker/compose.yaml` runs `ghcr.io/alexartaud-dev/canopy-*` at
   `CANOPY_VERSION` (default `latest`).
   - Docker Hub too, when the `DOCKERHUB_TOKEN` secret exists (a Docker Hub access token with
     read/write on the repository): both images go to one repository, `izoniks/canopy` by default,
     as `<version>-web`, `latest-web`, `<version>-engine`, `latest-engine`. The `DOCKERHUB_USERNAME`
     and `DOCKERHUB_REPOSITORY` repository variables override the account and repository.

- Release rules (schema, CalVer, notes) live in `scripts/release/release.lib.mjs`, tested at 100 %
  by `pnpm test:scripts` (part of `pnpm test`).

## Changelog (hand-written, translated)

```yaml
# changelog/unreleased.yaml
entries:
  - type: feat            # feat | fix | perf | security | refactor | docs | chore
    scope: files
    issue: 42
    text:
      en: Live progress for copy and move operations
      fr: Progression en direct pour la copie et le déplacement
      es: Progreso en tiempo real para copiar y mover
```

- Schema validated (Zod) in CI; all three languages required.
- In-app "What's new": grouped by version then type, in the user's locale; a "new since your last
  visit" badge; dev builds also show the Unreleased section.
