# Install as an app

Canopy installs on phones and computers like an app: its own icon, full screen, no browser bar.

## For people

- **Android, Chrome, Edge (desktop)**: account menu › **Install the app** (shown only when the
  browser offers it), or the browser's own install button.
- **iPhone, iPad**: Safari › Share › **Add to Home Screen**.
- **Needs HTTPS** (or `localhost`): browsers only install, and only run the service worker, on
  a secure origin. Behind the [reverse proxy](../user/reverse-proxy.md) it just works; over plain
  `http://192.168.…` the app stays a web page.
- **Share to Canopy** (Android, installed app): from the gallery or any app, Share › Canopy.
  Canopy opens with **N files shared from your phone** above the file list: open the folder
  where they go and **Upload here** (or **Discard**). They wait while you browse, and upload
  like any upload (rights, conflicts, resume, audit). iOS does not let web apps receive shares.
- When the server cannot be reached, the app shows **Canopy cannot be reached** with **Try
  again** instead of the browser's error page.

## How it works

- `app/manifest.ts` → `/manifest.webmanifest`, in the visitor's language: name, standalone
  display, shortcuts (Files, Shares, Commands), icons.
- Icons are drawn from the brand mark at build time with `next/og` (`/app-icons/<file>`, any and
  maskable, and `apple-icon` for iOS); no image files in the repository.
- `/sw.js` (`features/pwa/service-worker-source.ts`, a route so that the standalone Docker image
  needs no `public/` folder) keeps **one page**: `/offline` and its stylesheets. Failed
  navigations get that page; nothing else is cached (files, previews and API calls always go to
  the server). Bump `offlineCacheName` when what it keeps changes.
- **Share target**: the manifest's `share_target` posts to `/share-target`; the worker answers
  that post itself, keeps the files in the `canopy-shared-files` cache (name in a header) and
  opens `/`. They never reach the server until the person uploads them. `SharedFilesBanner`
  (file browser) reads them back, starts the usual upload flow and clears the cache. A
  `/share-target` route only redirects a share made before the worker took control.
- The manifest, icons and worker are public (excluded from the proxy's session redirect);
  `/offline` is a public page.
- `features/pwa/model/install-prompt.ts` registers the worker and keeps the browser's
  `beforeinstallprompt` for the account menu's entry.
