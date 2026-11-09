# Plugins

- A plugin is a third-party tool that adds catalog commands (see [commands](commands.md)). It is
  installed from a GitHub release of an **allowlisted** repository; nothing else can be installed.
- **Admin page** (`/admin/plugins`, `system:admin`): installed plugins (version, repository,
  commands, install date), **Enabled** and **Keep this version** (pinned: no update offered)
  switches, **Update to x.y.z** when a newer release exists, **Uninstall** (confirmation). Below,
  the latest release of each allowlisted repository not installed yet, with its notes and
  **Install**. The engine's platform (`linux-amd64`) is shown: only its binary is downloaded.
- Settings (module `plugins`): **Allowed repositories** (`owner/name`, comma separated; default
  `AlexArtaud-Dev/mrename`).
- **Install flow** (the engine has no internet access, the web app downloads):
  1. GitHub `releases/latest` of the repository (15 s timeout).
  2. `canopy-plugin.yaml` (≤ 64 KiB) → `POST /v1/plugins/inspect`: the engine checks it strictly
     and names the binary asset for its platform and the checksum asset. The manifest must name
     the same repository. A refused release costs no binary download.
  3. The checksum file (≤ 64 KiB), then the binary, streamed straight into `POST /v1/plugins`
     (multipart, never held whole in memory). Every download must be a
     `https://github.com/<repo>/releases/download/…` URL.
  4. The engine verifies the SHA-256, stores the binary (≤ 256 MiB) under
     `CANOPY_PLUGINS_DIR/<id>/<version>/`, removes the previous version and loads the commands.
- No install script ever runs. Updates keep the pin; a disabled plugin's commands disappear from
  the catalog at once.
- Audit (written by the engine): `plugins.install`, `plugins.update`, `plugins.uninstall`.
- Errors: `plugins.invalid_manifest`, `plugins.checksum_mismatch`, `plugins.unsupported_platform`,
  `plugins.not_found`, `plugins.github_unavailable`, `plugins.no_release`,
  `plugins.incomplete_release`, `plugins.repo_not_allowed`.
- Writing one: [writing a plugin](../integrations/writing-a-plugin.md).
