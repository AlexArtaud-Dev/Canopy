# v1 hardening pass

What was checked before v1, how, and what is still open. Re-run the automated parts with the
E2E suite on the compose stack (`pnpm test:e2e`, see `git-and-release.md`).

## Accessibility (WCAG 2.2 AA)

- `e2e/a11y.spec.ts` runs axe (`@axe-core/playwright`, WCAG 2.0–2.2 A/AA rules) on every main
  page, desktop and phone, signed in and on the sign-in page. It fails on any violation.
- Fixed in this pass:
  - `--muted-foreground` (light theme) darkened to `oklch(0.54 0 0)`: grey text on `--muted`
    was 4.34:1, under 4.5:1.
  - Account menu button: its label replaced the visible name (WCAG 2.5.3, label in name); the
    name is now part of it, the description is screen-reader text.
  - File list headers: `aria-sort` is only valid on table headers; the sort order is now said in
    words.
  - File rows: the selection checkbox was a focusable control inside a listbox option (nested
    interactive). It is now a visual mark; the option's `aria-selected` carries the state and
    Space toggles it.
- Manual checks: keyboard-only use of the file browser, dialogs and menus; visible focus; both
  themes; 200 % zoom; phone widths.

## Critical paths (Playwright)

Sign-in, sign-out, wrong password, setup wizard closed, permission denial (existing), plus:

| Spec                 | Path                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `two-factor.spec.ts` | Turn two-factor on, sign in with a code (a wrong one is refused) |
| `files.spec.ts`      | Browse, create a folder, upload, copy and move as operations     |
| `files.spec.ts`      | Delete → trash → restore                                         |

## Performance budgets

`e2e/budgets.spec.ts` measures the production build:

| Budget                                | Measured (v1 pass)     | Status                   |
| ------------------------------------- | ---------------------- | ------------------------ |
| Client JS per route < 200 kB gzip     | 335–402 kB             | Not met: #134            |
| 10k-entry folder: first rows < 300 ms | Measured in CI (Linux) | Recorded on every CI run |

Locally on Docker Desktop for Windows the big folder takes seconds: bind-mounted folders are
slow to list there, so only the Linux CI number is meaningful. The spec records both budgets
on every run; `E2E_ENFORCE_BUDGETS=1` turns them into failures once met.

## Security review

Checked against the product invariants and `security.md`:

- **No shell**: only two `exec.CommandContext` calls in the engine (catalog runner, ffmpeg), both
  with a fixed argument list. Nothing else starts a process.
- **Root confinement**: every user path goes through `fsx` (`os.Root`). Direct `os` calls are
  limited to the engine's own folders (plugins, thumbnail cache, upload staging by validated id).
  - Fixed: an upload or trash id names its volume in hex; a crafted id could name `..` and point
    the staging folder at the root's parent (impact: deleting a file with a random hex name in a
    `.canopy-uploads` folder there). `.` and `..` are now refused.
- **Authorization and audit**: every server action authorizes its caller, except the public ones
  by design (sign-in, password reset by token, setup — local network and no admin yet, under a
  lock —, public share links checked by token and password, language cookie). The engine checks
  grants again on every call and writes the audit events of file changes.
- **Headers**: CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame protection on every page;
  previews of active content are sandboxed.
- **Dependencies**: `govulncheck` clean; `pnpm audit --prod` reports one low (`deepmerge`) and one
  moderate (`minimatch` ReDoS) advisory in transitive dependencies with no exposure to user input.
- **Open**: secrets encrypted with a retired key are re-encrypted only when saved again; two-factor
  secrets never are, so a rotated key must stay listed in `CANOPY_ENCRYPTION_KEY_PREVIOUS`
  (documented in the user guide).
