# Dashboards

**Workspace › Dashboards**: each person has their own dashboards; nobody sees anyone else's.

- **First visit**: a default dashboard is made from what the person may read and becomes their
  home: _My folders_ (favorites and the volumes they reach), then, when their roles allow, the
  space used per volume, operations running, drop-offs received and the latest audit activity.
- **On a dashboard**: pick another one, the time range (1 h to 30 days) and the refresh (off,
  30 s, 1 min, 5 min), refresh now; the menu creates, duplicates, renames, opens it by default,
  puts the default panels back, or deletes it (confirmed). `/dashboards` opens the home one.
- **Panels**: single value, gauge, lines, areas, bars, ring, table, log and the folders list.
  A panel shows up to 6 variables (the gauge 2: used, then total as its maximum; the single
  value 1). Values become one number with an aggregation (latest, average, lowest, highest,
  total; counted events take their total over the range), with automatic or fixed decimals.
  Lines and areas draw each series in a theme colour; areas and bars can stack; a legend can be
  hidden.
- **Size and placement**: single values and gauges grow with their panel (sized in container
  units) and sit where the editor says, horizontally and vertically (centred by default).
- **Colour rules**: thresholds with a theme colour each; a value takes the colour of the
  highest threshold it reaches (single value, gauge, bars, ring, table).
- **Editor** (_Add a panel_, or a panel's menu › _Edit_): title, type, variables grouped by
  family (only what the person may read, of the kind the type draws), aggregation, decimals,
  gauge bounds, legend, stacking, colour rules and size, with a **live preview** of the real
  values beside the form (above it on a phone). Cancel leaves the dashboard as it was. A
  panel's menu also duplicates it, or removes it with _Undo_ in the toast.
- **Layout**: 12 columns on wide screens (each panel says where it sits), one column in
  reading order on phones.
- **Arrange** (wide screens): drag panels by their title bar and resize them from their sides and corners
  (react-grid-layout; panels slide up to fill gaps), or use each panel's **Arrange** menu from
  the keyboard (move, narrower, wider, shorter, taller; each step announced). **Done** saves,
  **Cancel** puts everything back.
- **Data**: every panel reads [variables](metrics.md) through `readVariable`, which checks the
  person's `metrics:<family>` permission on the server; a refused one says so in its panel.
- **Storage**: `app.dashboards` (owner, name, home, range, refresh, panels as JSON validated
  with `panelSchema` on every save and read). Audit: `dashboards.create`, `update`, `delete`,
  `home`.
