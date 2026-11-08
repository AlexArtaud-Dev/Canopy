# Operations panel

A panel at the bottom right of every page (full width on phones) lists running operations and
those finished in the last hour. It stays hidden when there is nothing to show.

## What it shows

- Per job: what it does and on which item, a progress bar (or an activity bar while totals are
  unknown), items and bytes done, speed, time left and the current file.
- Once finished: the outcome (for a folder size: size, files, folders, items not counted for lack
  of access), the translated error, or "Cancelled".
- Actions: cancel a running job, run a failed or cancelled job again (kinds that can simply be
  repeated), dismiss a finished one, clear all finished ones, collapse the panel.
- A toast when a job finishes or fails while the page is open. Toasts show at the top center, so
  they never cover the panel (which owns the bottom of the screen, full width on phones).
- Dismissed jobs are remembered per browser (local storage).

Command output (the "advanced mode" output view) arrives with the command runner: no job kind
writes output yet.

## How it stays live

- `listMyJobs` (server action) loads the recent jobs; the engine scopes them to the person
  (administrators see all).
- The browser opens `EventSource('/api/engine/v1/jobs/events')`. That route (App Router, outside
  the proxy matcher) checks maintenance and the session itself, signs the engine token and relays
  the engine's stream. Only listed engine routes pass (`engine-routes.utils.ts`); everything else
  is a 404. Streams close after 10 minutes so the browser reconnects and the session is checked
  again; on reconnect the list is reloaded to catch missed events.
- Events are validated against the contract schema; state transitions are pure
  (`jobs.utils.ts`, unit-tested).

## Starting jobs

The file browser's folder menu has **Calculate size**, which starts a `folder_size` job.
