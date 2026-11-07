# Audit log viewer (Administration › Audit log)

- `/admin/audit` (`audit:read`): newest first, 50 per page; filters in the URL (person by username
  or id, action from the registry, result, target text, date range in UTC); per-row details show
  the request ID and the sanitized metadata.
- **Export** (`audit:export`): CSV of the filtered events (max 10 000 rows), cells quoted and
  formula-prefixed values (`=`, `+`, `-`, `@`, tab, CR) neutralized; the export is audited.
- **Retention**: `audit.retentionDays` (default 365, env `CANOPY_AUDIT_RETENTION_DAYS`). A purge runs
  at start and daily (advisory lock across instances) inside the transaction the append-only
  trigger accepts (`SET LOCAL canopy.audit_purge = 'on'`), then records `audit.purge` with the count.
