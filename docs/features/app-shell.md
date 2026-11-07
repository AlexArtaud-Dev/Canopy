# App shell

The frame around every page: navigation, page header and user preferences.

## What it does

- **Sidebar** (`features/shell/ui/app-sidebar.tsx`): grouped navigation declared in
  `shell.nav.ts`. Collapses to icons on desktop (`Ctrl/⌘ + B` or the rail), becomes a sheet on
  phones and closes itself after a destination is picked. Active item uses `aria-current="page"`.
- **Page header** (`ui/page-header.tsx`): sticky bar with the sidebar toggle, page title (`h1`)
  and an optional actions slot.
- **Preferences** (`preferences.container.tsx` → `ui/preferences-menu.tsx`): theme (light, dark,
  system) and language (en, fr, es, listed by endonym). The language is stored in the
  `NEXT_LOCALE` cookie by the `setLocale` server action; no locale in URLs.

## Adding a page to the navigation

1. Create the route under `src/app/(app)/`.
2. Add an item to `navGroups` in `shell.nav.ts` and its label under `shell.nav` in
   `messages/{en,fr,es}/shell.json`.

## Design rules

- Neutral surfaces, one accent (Canopy green, `--primary`) used for primary actions, focus rings
  and the active state only. Tokens live in `src/app/globals.css`; no raw colors in components.
- Geist Sans / Geist Mono, bundled locally (no network at build time).
- Touch targets ≥ 44 px on phones, visible focus, reduced motion honored.
