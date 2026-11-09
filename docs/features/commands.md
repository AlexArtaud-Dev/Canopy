# Command catalog

- External tools run only from **catalog entries** (`apps/engine/internal/commands/builtin/*.yaml`,
  plugins later): there is no free-text command anywhere. An entry is offered only when its
  program is installed on the engine host (looked up once at start).
- **Entry**: id (`tool.action`), name/description (en/fr/es), bare `binary`, `mode` (basic for
  everyone, advanced only in advanced mode), typed `params` (path with `access` read/create/update,
  bool, int with min/max, enum, string with optional pattern; `flag` templates; `secret`), `args`
  template, `progressParser`, optional `dryRun.flag`, `timeout` (≤ 7 days). Files are decoded
  strictly (unknown fields refused) and checked at load.
- **Building**: values are validated (types, ranges, choices, patterns; unknown and missing params
  refused; free text may not start with `-`, so it cannot pass as an option). Each template item
  gives one argument, `{flags}` the flags of set params; nothing is ever split by a shell. Secrets
  are hidden (`••••`) in previews and the job log.
- **Paths**: the person must hold the param's access on the path (or on its folder when it does not
  exist yet). The tool gets a host path from `fsx.HostPath`: links followed on the existing part,
  refused when it leaves the root.
- **Running** (job `command`): `exec` without a shell, scrubbed environment (`PATH`, `LANG`,
  `HOME`), lower priority (`ionice -c3`, `nice -n 10` when installed), the engine's own user
  (PUID:PGID in compose), the entry's timeout (`commands.timeout`). Output lines (also split on
  `\r`) feed the parser (`rsync-progress2`, `percent-regex`, `line-count`, `none`) and the job log
  (5 000 lines, then `output truncated`; progress lines are not logged). Non-zero exit:
  `commands.failed` with the exit code in the result.
- **API**: `GET /v1/commands`, `POST /v1/commands/preview` (exact argv, secrets hidden, nothing
  runs), `POST /v1/jobs/command` (audited as `jobs.start`). Advanced entries need the
  `commands.advancedMode` setting and `commands:advanced` (administrators hold every permission).
- Built-in: `rsync.sync` (advanced, dry run). The default engine image has no rsync.

## Commands page (web)

- **Commands** in the sidebar (`/commands`): the entries the engine offers to the person, a form
  generated from each entry's params (paths as virtual paths, switches, numbers, choices, hidden
  secrets), the exact command refreshed as you type (`previewCommand`, 300 ms after the last
  change), **Simulate** when the entry has a dry run, then **Run**. The run's output appears below
  (read every second while it runs); its progress and result are in Operations.
- Settings (module `commands`): **Advanced mode** (off). Permission `commands:advanced` (global,
  in roles) unlocks advanced entries once the mode is on; administrators hold it.
