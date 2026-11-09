# Search

- The search box in the Files toolbar finds names in the current folder and all its subfolders
  (from the volume list: everywhere). It waits for 2 characters and 300 ms of pause; the words are
  in the URL (`?q=`), so a search can be shared or reopened with the back button. Escape clears.
- A name matches when it contains every word, ignoring case and accents (`ete` finds `Été`).
- Results replace the folder's entries in the same list or grid, with their folder under the name
  (list) or as the tooltip (grid). Everything else works the same: open, preview, menu, selection,
  drag and drop. The menu adds **Show in folder**. Results are ranked by the engine (names starting
  with the first word, then shallower paths); any other sort picked applies over them.
- Engine `GET /v1/fs/search?path=&q=` (`internal/search`): walks the tree through the
  root-confined resolver, never entering folders the person may not see (same visibility as a
  listing). Hard limits: 500 results, 200 000 entries visited, depth 32, 5 seconds. When one is
  reached, the response says which (`truncated`) and the footer suggests how to narrow down.
- Reading names changes nothing: searches are not audited. An index can replace the walk later
  without changing the API.
