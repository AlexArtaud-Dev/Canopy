# Notifications

The bell in every page's header shows what happened for the person: a sheet from the side (from
the bottom on a phone) lists the latest 50, unread ones in bold, with **Mark all as read**.
Opening one leads to what it is about and marks it read. The list refreshes every minute and
when the tab comes back.

## Sources

| Kind              | When                                  | Leads to                           |
| ----------------- | ------------------------------------- | ---------------------------------- |
| `dropOffReceived` | Files arrive through your upload link | Shares, with that link's drop-offs |

One notification per event source (`source_key`): a drop-off of 20 files is one line whose count
grows, unread again each time it changes.

## How it works

- `app.notifications` (person, kind, source key, params, in-app link, read, updated). Texts are
  translated when shown (`notifications.kinds.<kind>`); params never hold secrets.
- Features report with `notify({ userId, kind, sourceKey, params, href })` from the server. It never
  throws: a missed notification must not fail what it reports.
- Links are in-app paths only (`safeHref`); a kind this version no longer knows is not shown.
- Forgotten after 90 days, read or not. Read marks are the person's own and not audited.
- Adding a kind: add it to `notificationKinds`, its text in `messages/*/notifications.json`, and
  call `notify` where the event happens.
