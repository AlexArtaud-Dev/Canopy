# Devices

Screens and other devices plugins find on the network, kept by Canopy so that people pick them by
name instead of typing addresses.

- **Declared by plugins**: a manifest lists `devices` (a `kind` such as `screen`, its name in
  en/fr/es, the `detect` command, optionally `pair: { start, code }`). A string param with
  `device: <kind>` takes one of them; its value is the device's locator. Checked by the engine at
  install (kinds declared once, commands of the plugin, params only ask for declared kinds) and
  exposed in the catalog (`CommandPlugin.devices`, `CommandParam.device`).
- **Detection output**: one `locator<TAB>name<TAB>key=value;key=value` line per device. Canopy
  reads `type`, `model` and `pairing=needed`; other lines are ignored, as are locators that could
  pass as an option. At most 200 devices per kind.
- **Stored** in `app.plugin_devices` (web database): locator (identity per plugin and kind),
  announced name, the name an administrator gave, type, model, pairing needed, hidden, added by
  hand, first and last seen. A detection refreshes what devices announce; names and hidden flags
  stay.
- **Detection runs on the server** (`detectDevices`): the web app starts the plugin's detect
  command as the person (an ordinary run, authorized and audited by the engine, listed in
  Operations, its fields starting with the plugin's saved values), waits up to 90 s, reads the
  output itself and records it. Nothing a browser sends becomes a device.
- **In forms**: a device field lists the kept devices of its kind, switched-on ones first (found
  in the last 10 minutes), with model, "seen 3 days ago" and "to pair". An empty field takes the
  first one switched on. **Search** runs detection; a form also searches by itself when nothing
  was found in the last 2 minutes (once per tab in that time). Hidden devices are not offered.
  **Type an address…** keeps the old way for a device never found.
- **Administration › Configuration › Devices** (`/admin/devices`, administrators): one card per
  declared kind with **Search again** and **Add** (by locator, optional name); per device
  **Rename** (empty gives back the announced name), **Hide from forms** / **Offer in forms**,
  **Forget** (confirmed; a search finds it again). Devices of a kind no installed plugin
  declares any more can only be forgotten. Audited as `devices.add`, `devices.update`,
  `devices.forget`.
