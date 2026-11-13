# Responsive audit (phone, 375 × 812)

Every screen opened in the built-in browser at 375 × 812 (mobile emulation: touch, Android
Chrome) on 2026-11-13, with a script reporting what reaches past the viewport outside a
scrolling container, and a look at each screen. Severity: **high** breaks the page (it zooms
out or hides actions), **medium** works but badly, **low** cosmetic.

The worst finding is shared: any element wider than the screen makes a phone browser lay the
whole page out wider (601 px here) and zoom out, so every screen looks tiny and everything is
hard to touch. Removing every overflow is the first fix.

## By shared component

| Component                           | Problem                                                                                                                                    | Severity | Screens                     | Issue |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------- | ----- |
| File browser toolbar                | Import, new folder, sort, view switch, refresh, shortcuts in one row: 426 px wide, the view switch and refresh fall off the screen         | high     | file browser                | #179  |
| File browser footer (selection bar) | Count, selection and four actions (delete, download, copy, move) in one row: 601 px wide, the page zooms out as soon as a file is selected | high     | file browser                | #179  |
| File rows                           | A tap opens (touch is told from the mouse), but an item's actions exist only on right click / long press, which nothing shows              | high     | file browser                | #179  |
| Operations panel                    | Full width at the bottom, open by default: covers the bottom of every page, including a form's Run button                                  | high     | all                         | #178  |
| Filter forms                        | Two-column grids (dates) and filter rows wider than the screen                                                                             | high     | audit log                   | #182  |
| Tables                              | Scroll sideways inside their card; the columns that hold the state and the actions are out of sight                                        | medium   | shares, audit log           | #177  |
| Dialogs                             | Centred boxes: long forms scroll as a whole, the primary action can end below the keyboard                                                 | medium   | share, properties, commands | #181  |
| Viewers                             | Toolbar buttons small for touch; no pinch to zoom on images                                                                                | medium   | previews                    | #180  |
| Built-in role descriptions          | Shown in English whatever the language ("Full control of Canopy.")                                                                         | low      | roles                       | #182  |
| Search placeholders                 | Cut ("Rechercher par nom, identifiant ou e-m")                                                                                             | low      | users                       | #182  |

## Fixed in the first pass

- No page is wider than the screen any more: toolbar and selection actions keep their icons
  only on a phone, the breadcrumb takes a row of its own, page grids bound their column
  (`grid-cols-1`, so a wide table scrolls inside its frame), the audit log's date filters shrink.
- A **⋮** button on each file (touch screens only) opens the item's own menu; keyboard
  shortcuts are hidden from menus on touch screens.
- The operations panel starts folded on a phone.
- The shares table keeps its state and actions in view (the name column truncates).

## Screens that hold up

Trash, account, system status, users, groups, roles, settings, e-mail, plugins (list and a
plugin's page), devices, commands (the list and the form take the screen in turn): no overflow,
readable, reachable with a thumb.

## Not covered yet

Sign-in and 2FA, the public share page, and the setup screens need a signed-out browser; they
are checked with #178.
