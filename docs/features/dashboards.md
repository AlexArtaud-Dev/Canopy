# Dashboards

**Workspace › Dashboards**: each person has their own dashboards; nobody sees anyone else's.

- **First visit**: a default dashboard is made from what the person may read and becomes their
  home: _My folders_ (favorites and the volumes they reach), then, when their roles allow, the
  space used per volume, operations running, drop-offs received and the latest audit activity.
- **On a dashboard**: pick another one, the time range (1 h to 30 days) and the refresh (off,
  30 s, 1 min, 5 min), refresh now; the menu creates, duplicates, renames, opens it by default,
  puts the default panels back, or deletes it (confirmed). `/dashboards` opens the home one.
- **Panels** (this version): a single value (the latest one; counted events show their total
  over the range), a line chart (Recharts, one line per series, theme colours), a log (audit
  lines) and the folders list. More types, colour rules, an editor with live preview and a
  draggable grid come next (#222–#224).
- **Layout**: 12 columns on wide screens (each panel says where it sits), one column in
  reading order on phones.
- **Data**: every panel reads [variables](metrics.md) through `readVariable`, which checks the
  person's `metrics:<family>` permission on the server; a refused one says so in its panel.
- **Storage**: `app.dashboards` (owner, name, home, range, refresh, panels as JSON validated
  with `panelSchema` on every save and read). Audit: `dashboards.create`, `update`, `delete`,
  `home`.
