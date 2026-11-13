# Plugins

- A plugin is a third-party tool that adds catalog commands (see [commands](commands.md)). It is
  installed from a GitHub release of an **allowlisted** repository; nothing else can be installed.
- **Admin page** (`/admin/plugins`, `system:admin`), two tabs:
  - **Installed**: one card per plugin (version, description, number of commands, **Update to
    x.y.z** when a newer release exists) leading to its own page with **Configure**. The
    engine's platform (`linux-amd64`) is shown: only its binary is downloaded.
  - **Add plugins**: the latest release of each allowlisted repository not installed yet, with
    its notes and **Install**; then the **Sources**.
- **A plugin's page** (`/admin/plugins/<id>`): the update when one is offered; **What forms start
  with**, one row per setting the plugin's commands take (optional text and number fields,
  never secrets, paths, devices, nor fields a command requires, nor those of secondary
  commands), each with its help sentence, its values (the first one is used, the others offered
  by name; the name is optional) and an inline **Add**; the plugin's **Devices** (see
  [devices](devices.md)); its **commands**, each opening on the Commands page; its **State**:
  **Enabled**, **Keep this version** (pinned: no update offered), **Uninstall** (confirmation,
  back to the list).
- **Sources** (Add plugins tab): the allowed repositories, default `AlexArtaud-Dev/mrename`. **Add**
  takes `owner/name` or a GitHub address and checks the latest release first: it must carry
  `canopy-plugin.yaml`, accepted by the engine and naming this very repository
  (`plugins.invalid_repo`, `plugins.repo_already_allowed`, `plugins.no_release`,
  `plugins.incomplete_release`, `plugins.invalid_manifest`). **Remove** asks for confirmation; a
  plugin installed from it stays installed but can no longer be updated. Both change the
  `plugins.allowedRepos` setting (audited as `settings.update`), which no longer shows on the
  generated settings page.
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
- Casting to TVs with dapple, from the compose file to the first film: [casting](casting.md).
