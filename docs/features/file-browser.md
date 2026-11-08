# File browser

The Files page (`/`) shows one folder at a time, as the signed-in person sees it: the engine
filters out everything their folder rules hide.

## URL

`/?path=/photos/2024&sort=size&order=desc` — the folder and its sort are in the URL, so a view can
be bookmarked or shared. Defaults (`/`, name, ascending) are left out. Junk falls back to them.

## Loading

- The server renders the first page (500 entries) so the folder paints at once.
- Further pages load through the `listFolder` server action as the list scrolls (TanStack Query
  infinite query), starting 100 entries before the end.
- Only visible rows are in the DOM (TanStack Virtual), in both views, so 10k-entry folders stay
  smooth.

## Views

- **List**: name, size and modified date, with sortable column headers; on phones size and date
  move under the name. Rows are 44 px (touch target).
- **Grid**: tiles whose column count follows the width.
- The choice is remembered per browser (local storage; falls back to list).

## Selection and keyboard

Click selects, Ctrl/Cmd+click toggles, Shift+click extends from the anchor, the row checkbox
toggles. On touch screens a tap opens; once something is selected, taps toggle.

Keyboard (on the list): arrows, Home/End, PgUp/PgDn move; Shift extends; Space toggles; Enter
opens a folder; Backspace goes up; Ctrl+A selects all; Esc clears; Shift+F10 or the menu key opens
the item menu; `?` lists the shortcuts.

Selection and focus logic is pure (`browser.utils.ts`) and unit-tested.

## Context menu

Right-click, or long-press on touch screens: Open (folders), Copy path, Select all, Refresh.
File operations, upload and download arrive with their own slices.
