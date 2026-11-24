# Plugin views

- A plugin can bring **live pages** ("views"), declared in its manifest (see
  [writing a plugin](../integrations/writing-a-plugin.md#views-a-live-page-of-your-own)). The
  first one is the **Downloads** page of [jdctl](https://github.com/AlexArtaud-Dev/jdctl), which
  follows and controls JDownloader 2.
- **Where**: each view the person may open is listed in the sidebar under **Extensions**
  (`/views/<plugin>/<view>`). A view with `widget` adds a pill to the page header while it says
  it is active (progress and speed), read three times less often than on its page and hidden on
  the page itself.
- **The page**: a summary bar (state, progress, speed, time left) with the view's actions; one
  tab per section with its count; rows with state, progress, size and where they come from or
  go, expandable to their items. Choosing rows (checkboxes) shows the section's row actions;
  an action marked `confirm` asks first, one with `input` asks for a text. Empty, loading and
  error states are shown; "Updated every N s." under the list.
- **Reading**: the engine runs the view's source command on demand
  (`GET /v1/plugins/{plugin}/views/{view}`), without a job: 15 s at most, 2 MiB of output at
  most, with `CANOPY_PLUGIN_DATA` set. The web app reads the JSON leniently: unknown fields are ignored,
  rows without an id are dropped.
- **Actions** run the plugin's commands as quiet jobs (no jobs panel pop-up; a toast says the
  action was sent), with the chosen ids as comma-separated string params. Each is authorized by
  the engine and audited as `jobs.start`.
- **Rights**: one permission per view, `plugins:view.<plugin>.<view>`, in the roles editor under
  **Plugin pages** (installed views only); administrators always have it. Without it the view is
  hidden and the commands it uses are neither listed nor runnable. Errors:
  `plugins.view_not_found`, `plugins.view_failed`, `plugins.view_forbidden`.
