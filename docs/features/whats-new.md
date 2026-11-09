# What's new

- **Page** (`/whats-new`, everyone signed in; account menu → What's new): the changelog by version
  (newest first, with its date) then by type (New, Fixes, Performance, Security…), in the person's
  language, with each change's scope and issue link. The running version is shown; development
  builds (`0.0.0` or not `NODE_ENV=production`) list the Unreleased changes first.
- **Badge**: a dot on the account avatar and a "New" pill on the menu entry when a release came out
  since the person last opened the page; releases newer than that are marked "New" on the page.
  Leaving the page (or closing the tab) marks them seen. Remembered per browser
  (`canopy.whatsNew.lastSeen`); without storage the dot comes back next visit.
- **Source**: `changelog/releases/<version>.yaml`, validated with the shared schema
  (`@canopy/contracts/changelog`, also used by the release scripts). Read once per process in
  production; the web image ships `changelog/releases` (`CANOPY_CHANGELOG_DIR=/app/changelog`),
  never Unreleased. An invalid release file is skipped and logged.
