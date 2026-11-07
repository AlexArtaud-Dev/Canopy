# Modules & settings

## CanopyModule

Every feature module declares itself once:

```ts
export interface CanopyModule<TSettings extends z.ZodObject<z.ZodRawShape>> {
  id: ModuleId;
  permissions: PermissionManifest;
  settings?: SettingsDefinition<TSettings>;
  navigation?: readonly NavEntry[];
  auditActions: readonly string[];      // "<module>.<action>"
}
```

Registering a module automatically wires: the permission matrix, the settings page, navigation
entries (filtered by permissions) and audit action labels.

- Declare it in `features/<domain>/<domain>.module.ts` with `defineModule({...})`
  (`shared/modules/module.types.ts`) and add it to `src/modules.ts`, the single registration point.
- `createRegistry()` validates declarations at startup: kebab-case ids, unique ids and hrefs,
  actions in `snake_case`, audit actions named `<module>.<action>`, navigation permissions declared.
- Module files are imported by the client navigation: keep them free of server-only imports.
- Navigation labels live under `shell.nav.<labelKey>`, groups under `shell.groups.<group>`.

## Settings

- Defined as a Zod object with `.default()` on every field — sensible defaults, the app works with zero config.
- Field metadata: i18n label/description keys, group, `requiresRestart`, `sensitive` (encrypted at rest),
  `localOnly` (editable only from a local IP).
- Stored in `app.settings` (module, key, jsonb value, updatedBy, updatedAt). Typed `getSettings(module)`,
  in-memory cache invalidated via Postgres `NOTIFY`.
- Admin UI generated from the schema: search, groups, "modified" indicator, reset to default, every change audited.
- Settings consumed by the engine are defined as JSON Schema in `packages/contracts/settings/` and
  generated into Zod (web) and Go structs (engine) — one definition only.
- Env vars are bootstrap-only (see architecture.md) and override DB values (shown read-only).

## Default values (initial proposal)

| Setting                          | Default             |
| -------------------------------- | ------------------- |
| Trash retention                  | 30 days             |
| Trash purge schedule             | daily 03:00         |
| Trash bypass threshold           | 10 GiB              |
| Max concurrent jobs              | 2 (1 per user)      |
| Copy verification across volumes | size only           |
| Upload chunk size                | 8 MiB (resumable)   |
| Session lifetime / idle timeout  | 7 days / 24 h       |
| Login lockout                    | 5 attempts / 15 min |
| 2FA                              | optional            |
| Audit retention                  | 365 days            |
| Advanced mode                    | off                 |
| Thumbnails                       | on                  |
| Default theme / locale           | system / en         |
| Share links default expiry       | 7 days              |
