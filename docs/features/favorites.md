# Favorite folders

- Each person pins folders from the folder's right-click menu, the empty-space menu of the open
  folder, or the star next to the breadcrumb. The root cannot be pinned; at most 50 favorites.
- **Sidebar**: a Favorites group right after Workspace. A favorite the person can no longer open
  (grants changed, folder moved or deleted) stays listed, dimmed and inert, until removed (× on
  hover).
- **Folder picker** (Copy to / Move to): available favorites appear as shortcuts.
- Stored by the web app in `app.favorite_folders` (one row per person and path, cascade on user
  deletion). Listing checks each favorite with the engine (`statEntry`): favorites are shortcuts
  only, never a way around path grants.
- Audit: `files.favorite_add`, `files.favorite_remove`.
