# Permissions

## Model

- **Subjects**: users and groups (a user belongs to any number of groups).
- **Roles**: named bundles of permissions. Built-in `Admin`, `Editor`, `Viewer` (editable); custom roles allowed.
  Roles are assigned to users or groups.
- **Two scopes**, declared by each module's manifest:
  1. **Global** permissions `<module>:<action>` — e.g. `users:create`, `settings:update`, `audit:read`.
  2. **Path** permissions for the `files` module, granted per path:
     `read, upload, create, update, move, copy, delete, download, share, execute`.
- **Path grant**: `(subjectType, subjectId, virtualPath, actions[], effect: allow | deny)`.
- `system:admin` bypasses path grants (still fully audited).

## Implementation (web)

- Tables in `auth`: `roles` (`permissions text[]`, `*` = everything, built-in `key` admin/editor/
  viewer), `groups` (`require_two_factor`), `group_members`, `user_roles`, `group_roles`.
- `loadPermissions(userId)` (`features/access/server/permissions.ts`) unions direct and group
  roles, expanded against the registry (`effectivePermissions`, pure). The session carries them;
  `isAdmin` means holding `system:admin`.
- Server: `authorize('<module>:<action>')` (`features/auth`) — audits refusals as
  `auth.access_denied` and fails with `auth.forbidden`.
- UI: `PermissionsProvider` in the app layout, `useCan()` / `<Can permission>` (`shared/permissions`).
- The setup wizard's account gets the `admin` role; disabled accounts get no session.

## Path resolution (engine `authz`, pure, 100% tested)

1. Collect grants of the user and of all their groups.
2. Keep grants whose path is the target or one of its ancestors.
3. The most specific (deepest) path wins.
4. At equal depth: user-level beats group-level; at the same level, `deny` beats `allow`.
5. No matching grant → no access (default deny). `system:admin` bypasses grants.
6. Folders above a granted one are listed (names only) so users can reach it (`MayTraverse`).
7. **Share links** act for their owner with a `scope` (engine token claims `scope` + `shr`): checked
   before everything else, only `read` and `download` under the shared path are allowed, even for
   an administrator's share, and never more than the owner's own grants. Share tokens may only call
   `GET /v1/fs/entry`, `GET /v1/fs/list` and the download routes; each access is audited with the
   share id. **Upload links** (`smode: upload`) may only `upload` into the shared folder, through
   the tus routes only; each ticket names one file (`upl`: name and size) and starts one upload
   (`jti`, single use); link uploads are kept as copies on conflicts, never create subfolders, and
   can be resumed only through the same link.

Implementation: `apps/engine/internal/authz` (pure, 100 % covered) and `internal/grantstore`
(loads `app.path_grants`, written by the web app; the engine is read-only on `app`).

| Grants                                     | `/media/kids` | `/media/private` |
| ------------------------------------------ | ------------- | ---------------- |
| group Family: allow read `/media`          | read          | read             |
| + group Family: deny read `/media/private` | read          | —                |
| + user Alice: allow read `/media/private`  | read          | read (Alice)     |

## Devices (screens)

Plugins' devices can be restricted to groups (`app.device_groups`, empty = open to everyone who
may run the command; `system:admin` uses every device). The rule is pure
(`mayUseDevice` / `refusedDevice` in `features/devices/devices.utils.ts`, fully tested) and every
command run goes through `assertDevicesAllowed` in the web app before reaching the engine; the
engine itself knows nothing of devices. See [devices](../features/devices.md).

## Generic module interface

```ts
export interface PermissionManifest<TAction extends string = string> {
  module: ModuleId;                 // "users"
  scope: 'global' | 'path';
  actions: readonly TAction[];      // ["read", "create", "update", "delete"]
  labelKey: string;                 // i18n prefix for the admin matrix
}
```

- Each module exports its manifest via its `CanopyModule` declaration; a registry aggregates them.
- The admin permission matrix (roles × actions) is generated from the registry — no hand-written screens.
- Server guard: `authorize(ctx, 'users:create')` at the top of every server action / route handler.
- UI helper: `<Can permission="users:create">` hides or disables controls (UX only).
- Engine operations declare their required path actions; the HTTP layer enforces them.

## Admin UX

- Groups and users editors, role editor, path grants editor with a folder picker.
- "Effective access" explainer: for a user + path, shows the result and the exact grant that decided it.
- Every permission change is audited.
