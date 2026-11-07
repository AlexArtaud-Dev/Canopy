<!-- Title: Conventional Commit summary, e.g. "feat(files): add live progress for moves". -->

## Summary

-

Closes #

## Screenshots

<!-- UI changes: before/after screenshots or a short GIF (desktop + mobile). Delete otherwise. -->

## Definition of Done

- [ ] Lint 0 / typecheck / format clean (TS + Go)
- [ ] Tests green; coverage gates met
- [ ] i18n keys present in en, fr, es
- [ ] Permissions declared in the module manifest and enforced server-side
- [ ] Audit events emitted for every state change
- [ ] Errors mapped to codes + translations; loading, empty and error states handled in UI
- [ ] Responsive + touch checked; keyboard nav, aria, contrast (WCAG 2.2 AA)
- [ ] Theme-safe: only design tokens, no hard-coded colors
- [ ] Contracts regenerated if the API changed (CI drift check passes)
- [ ] `docs/features/<feature>.md` updated
- [ ] `changelog/unreleased.yaml` entry (en/fr/es) or `no-changelog` label justified
