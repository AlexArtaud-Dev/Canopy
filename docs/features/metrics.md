# Metrics

The values dashboards read. The engine samples them every 30 seconds and keeps them in Postgres.

| Metric                     | Family     | Unit        | Series      |
| -------------------------- | ---------- | ----------- | ----------- |
| `system.cpu`               | system     | percent     |             |
| `system.memory.used/total` | system     | bytes       |             |
| `system.network.received`  | system     | bytes/s     |             |
| `system.network.sent`      | system     | bytes/s     |             |
| `storage.volume.used`      | storage    | bytes       | each volume |
| `storage.volume.total`     | storage    | bytes       | each volume |
| `storage.trash`            | storage    | bytes       |             |
| `storage.thumbnails`       | storage    | bytes       |             |
| `operations.running`       | operations | count       |             |
| `operations.queued`        | operations | count       |             |
| `operations.failed`        | operations | count (1 h) |             |

- **System** values come from `/proc` (Linux, so the Docker image); elsewhere they are left out.
  CPU and network are rates between two samplings. Volumes are the root's top-level folders,
  measured on their filesystem.
- **Storage** (`engine.metric_samples`, `engine.metric_hourly`): raw samples for
  _Keep detailed metrics_ (24 h by default), hourly averages with min and max for _Keep hourly
  metrics_ (30 days), both in Settings › System. Every 10 minutes finished hours are rolled up
  and older rows deleted.
- **API**: `GET /v1/metrics` lists the metrics the caller may read. `GET /v1/metrics/series`
  returns one metric over `[from, to)` in at most `points` buckets: raw samples while the range is
  within their retention, hourly rollups beyond.
- **Permissions**: a family needs `metrics:<family>` (administrators read all). Share-link tokens
  never read metrics. The web app's roles grant these permissions (#220).

## Variables (web)

Dashboards read **variables**: the engine's metrics above plus values the web app computes.

| Variable          | Family | Kind                                |
| ----------------- | ------ | ----------------------------------- |
| `shares.active`   | shares | count now                           |
| `shares.dropOffs` | shares | drop-offs per bucket                |
| `users.accounts`  | users  | active accounts now                 |
| `users.sessions`  | users  | open sessions now                   |
| `logs.denied`     | logs   | refused actions per bucket          |
| `logs.audit`      | logs   | the latest 50 audit entries (a log) |

- **Permissions**: the roles editor has a **Dashboard variables** row with one permission per
  family (`metrics:system`, `storage`, `operations`, `shares`, `users`, `logs`). Administrators
  read everything; nobody else reads a family by default.
- `loadVariables()` lists what the person may read. `readVariable({ id, range })` checks the
  family **on the server** (refusals audited as `metrics.read_denied`) and returns one shape for
  every panel: series of `{ at, avg, min, max }` buckets, or log lines. Ranges: 1 h, 6 h, 24 h,
  7 d, 30 d.
- Labels: `dashboards.variables.<id>` in the messages.
