# App shell

The frame around every page: navigation, page header and user preferences.

## What it does

- **Sidebar** (`features/shell/ui/app-sidebar.tsx`): groups (Workspace, Administration) hold
  pages and collapsible sections (`shared/modules/nav-sections.ts`: User management,
  Configuration, Monitoring). Sections start folded except the one holding the current page, to keep
  the sidebar short; one unfolded by hand stays open during the visit. Collapsed to icons (`Ctrl/⌘ + B` or the rail), a section is an icon
  opening a menu of its pages. Becomes a sheet on phones and closes itself after a destination is
  picked. Active item uses `aria-current="page"`.
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

## Updates while a tab is open

Each release is a Next.js deployment (`deploymentId` = the version): a tab opened on an older one
is hard-reloaded on its next navigation. A server action called from such a tab (Next answers
409 "Server Action unavailable") reloads the page once (`shared/errors/stale-version.ts`, from the
error pages and TanStack Query's caches), showing "Canopy was just updated"; a second failure within
30 seconds shows the error instead of looping.
