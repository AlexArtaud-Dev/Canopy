# Writing a Canopy plugin

A plugin lets Canopy run your command-line tool from its **Commands** page, with typed options,
live progress and output. Canopy never runs a shell: it builds an argument list from your
manifest and the values people fill in, and runs your binary directly.

## What a release must contain

Publish a GitHub release (not a draft or pre-release: Canopy reads `releases/latest`) with:

| Asset                   | Content                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `canopy-plugin.yaml`    | The manifest (exact name, ≤ 64 KiB)                                  |
| a checksum file         | `sha256sum` output listing every binary (`<hex>  <asset name>`)      |
| one binary per platform | Statically linked executables for `linux-amd64` and/or `linux-arm64` |

The administrator must add your repository (`owner/name`) under **Administration → Plugins →
Sources** before it can be installed. Canopy checks your latest release when it is added, so
publish one first.

## The manifest

```yaml
id: mytool # lowercase letters, digits, dashes (2–32)
name: { en: My tool, fr: Mon outil, es: Mi herramienta }
description: { en: What it does, fr: Ce qu’il fait, es: Lo que hace }
version: 1.2.0 # must match the release
binary: mytool # file name the binary is stored under
source:
  repo: owner/mytool # the repository the release comes from
  checksums: SHA256SUMS # asset listing the SHA-256 sums (mandatory)
  assets:
    linux-amd64: mytool-linux-amd64
    linux-arm64: mytool-linux-arm64
commands:
  - id: mytool.run # always <plugin id>.<action>
    name: { en: Run, fr: Lancer, es: Ejecutar }
    description: { en: …, fr: …, es: … }
    binary: mytool # always the plugin's own binary
    mode: advanced # basic: everyone; advanced: only in advanced mode
    params:
      - name: folder
        type: path # path | bool | int | enum | string
        access: update # read | create | update (checked against the person's rights)
        on: folder # folder (default) | file: what the file browser offers the command on
        # extensions: [mkv, mp4] # with on: file, only these files (lower case, no dot)
        required: true
        label: { en: Folder, fr: Dossier, es: Carpeta }
      - name: dryRun
        type: bool
        flag: --dry-run
        advanced: true # folded under "More options"
        help: { en: Shows what would change., fr: Montre ce qui changerait., es: Muestra lo que cambiaría. }
        label: { en: Simulate, fr: Simuler, es: Simular }
    args: ['{flags}', '{folder}']
    progressParser: line-count # rsync-progress2 | percent-regex | line-count | none
    timeout: 1h
```

Unknown fields are refused. Every command follows the catalog rules described in
[commands](../features/commands.md): typed values, no free text starting with `-`, one argument
per template item.

The first `path` parameter is the one the file browser fills in: right-clicking a folder (or a
file, with `on: file`) lists your command under **Plugins**, and opens it with that entry
already chosen. `on` and `extensions` need Canopy 2026.11.7 or later: older versions refuse
manifests that use them.

A text field can offer what one of your commands finds (devices, profiles, remotes): add
`choicesFrom: mytool.list` to the param, and make `mytool.list` print one
`value<TAB>label` line per choice. The form gets a **Detect** button that runs it. Needs Canopy
2026.11.8 or later.

Keep forms short: mark what most runs leave alone `advanced: true` (folded under **More
options**, opened by itself when one of them holds a value), and give each field a `help`
sentence in the three languages. A required field cannot be advanced unless it has a default.
A command marked `secondary: true` stays runnable but leaves the commands list: use it for a step
your other screens lead to (entering a pairing code). Needs Canopy 2026.11.11 or later.

Administrators can save named values for your text and number fields (a device, a host): give
the same field the same `name` in every command, and one saved list serves them all.

## What your tool can rely on

- Paths arrive as absolute host paths inside the Canopy root, already checked against the
  person's rights.
- It runs as the engine's user, at low priority, with only `PATH`, `LANG` and `HOME` set, and is
  stopped at the command's `timeout` or when the person cancels.
- Each line of output (also split on `\r`) is shown live; a non-zero exit code marks the run as
  failed. Make progress lines parseable by the parser you chose (`line-count` counts lines;
  `percent-regex` reads `NN%`).
- Never ask for input on stdin: there is none.
- `CANOPY_PLUGIN_DATA` names a folder that is yours: keep there what must outlive a run (a
  pairing, a cache). It survives updates of your plugin and is removed when the plugin is
  uninstalled. The rest of the filesystem may be read-only, the temporary folder included.
  Needs Canopy 2026.11.10 or later.

## Checklist before publishing

1. `sha256sum mytool-linux-* > SHA256SUMS` and upload all files to the release.
2. The manifest's `version` matches the release tag (`v1.2.0` or `1.2.0`).
3. Your tool works without a terminal and without interactive prompts.
