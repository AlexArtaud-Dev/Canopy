# System status

Shows whether the web app, the engine and the database are reachable (`/system`).

## How it works

- `features/system/server/get-system-status.ts` calls the engine's `GET /readyz` (2 s timeout,
  never cached). The engine pings Postgres before answering.
- `system.utils.ts → toSystemStatus` maps the probe to a state per service:

| Probe result                                   | Engine | Database |
| ---------------------------------------------- | ------ | -------- |
| `200`                                          | up     | up       |
| `503` with code `system.database_unavailable`  | up     | down     |
| any other response, timeout or network failure | down   | unknown  |

## Engine endpoints

- `GET /healthz` — liveness, never touches dependencies.
- `GET /readyz` — readiness, pings the database; errors use the shared
  `{ code, params, requestId }` model.
- Web liveness: `GET /api/health`.
