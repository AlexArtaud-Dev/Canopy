# Groups and roles (Administration › Groups, Roles)

- **Roles** (`/admin/roles`, `roles:*`): bundles of global permissions edited through a matrix
  generated from the module registry (one row per module, one checkbox per action), or "Full
  access" (`*`, includes future modules). Built-in Admin, Editor and Viewer keep their translated
  name and cannot be deleted; their permissions are editable.
- **Groups** (`/admin/groups`, `groups:*`): name, description, roles and "require two-factor".
  Members are managed on the group's own page (`/admin/groups/<id>`): search people to add,
  remove members (audited `groups.members_add|members_remove`; removal is refused when it would
  leave no active administrator). Members of such a group without 2FA are sent to `/two-factor/setup`
  on their next request and cannot turn 2FA off.
- **Safety**: every role/group change runs in a transaction that is rolled back if no active
  administrator would remain (`withAdminGuard`).
- Audit: `roles.create|update|delete`, `groups.create|update|delete`.
