# Frontend (apps/web)

## Feature slice structure

```
src/
├── app/                         # routes only: thin RSC pages composing slices
├── features/<domain>/
│   ├── server/                  # 'server-only': Drizzle queries, engine client, server actions
│   ├── model/                   # client: TanStack Query hooks, SSE hooks, local state
│   ├── ui/                      # presentational: props in, events out
│   ├── <domain>.container.tsx   # client: wires model hooks to ui (when interactive)
│   ├── <domain>.types.ts · <domain>.schemas.ts · <domain>.utils.ts
│   ├── <domain>.module.ts       # CanopyModule declaration (permissions, settings, nav)
│   └── index.ts                 # the slice's only public API
└── shared/                      # ui primitives (shadcn in shared/ui), lib, config, i18n, theme
```

Dependency direction is one-way: `ui ← container ← model ← server/contracts`.

- Logic lives **next to** its render (same slice) but **not in** the render file.
- `ui/` never fetches, never imports `server/` or `model/`, holds no business rules.
- Pages (RSC) fetch through `server/` and pass DTOs to `ui/` or a container.
- Server actions: first lines = Zod validation, then `authorize(ctx, "<module>:<action>")`.
- Slices import each other only via `index.ts` (enforced with eslint-plugin-boundaries).
- Strict RSC/client boundary: `"use client"` only in containers, `model/` and interactive `ui/`.

## Theming

- Only shadcn CSS variable tokens: `bg-background`, `text-foreground`, `text-muted-foreground`,
  `border`, `bg-accent`, `ring`… Never hex/rgb, never raw palette classes (`bg-zinc-900`).
- Light/dark: next-themes (`class` strategy, `system` default).
- Color themes: `data-theme="<name>"` redefines tokens in `shared/theme/themes/<name>.css`
  (light + dark blocks). Adding a theme = adding one token file and registering it.
- Structural differences (e.g. logo swap) only via `useTheme()`, never conditional colors.

## Layout & devices

- Collapsible shadcn `Sidebar` (desktop), `Sheet` on mobile; breadcrumbs + active nav states.
- Touch: long-press opens the same context menu as right-click; targets ≥ 44 px;
  drag & drop always has a keyboard/menu alternative (Move to…).
- File views: list and grid, virtualized (TanStack Virtual), keyboard navigation (arrows, Enter,
  Space to select, shortcuts listed in a `?` help dialog).

## UX patterns

- Guidance: `Tooltip`, `Popover`, Sonner toasts (with Undo action when reversible).
- Multi-step flows: shared `Stepper` (built once in `shared/ui/stepper`, shadcn has none).
- Destructive: `AlertDialog` naming exactly what will happen; trash bypass shows a stronger warning.
- States: skeletons for loading, explicit empty states, inline errors with an action.
- **Jobs panel**: global, persistent dock — progress bar, speed, ETA, current file, cancel, retry,
  expandable live output (advanced mode), notification on completion.
- Errors: error boundary per route segment; message = translated code + suggested action +
  copyable requestId. Never a raw API/stack message.
  - Server actions wrap their body in `runAction()` (`shared/lib/action.ts`) and return
    `{ ok, data | error }`; `error` is an `ErrorDto` (`code`, `params`, `requestId`).
  - Show failures with `<ErrorState code reference onRetry />` (`shared/errors`); unknown codes fall
    back to `system.unexpected`. Add every new code to `messages/<locale>/errors.json`.
  - Uncaught server errors render `error.tsx` with the Next digest as reference; `onRequestError`
    logs the same digest with the stack trace.

## i18n

- next-intl, cookie `NEXT_LOCALE`, no locale in URLs. `en` is the source language; `fr`, `es` required.
- Messages split by feature: `messages/<locale>/<feature>.json`, namespace = feature.
- ICU plurals; dates, numbers and file sizes via shared `Intl` formatters, never hand-formatted.
- CI fails on missing or unused keys (`pnpm check:i18n`). Unused detection scans `src/` per file:
  namespaces from `useTranslations`/`getTranslations` × key strings in calls. Template keys
  (``t(`nav.${key}`)``) count as one-segment wildcards, so keep dynamic keys as literal prefixes.
  Keys only known at runtime (error codes) are declared with a `// i18n-dynamic: <prefix>` comment.
- Exception: data not owned by the app (file names, external values) is displayed as-is.

## Accessibility

WCAG 2.2 AA: contrast via tokens, full keyboard navigation, correct `aria-*`, focus restored after
dialogs, visible focus rings, `prefers-reduced-motion` respected.
