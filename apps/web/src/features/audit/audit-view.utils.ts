import { z } from 'zod';

export const auditPageSize = 50;
/** CSV exports stop here: beyond it, narrow the filters. */
export const auditExportLimit = 10_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

/** `?actor=&action=&result=&target=&from=&to=&page=` of the audit viewer, tolerant of junk. */
export const auditFiltersSchema = z.object({
  actor: z.string().trim().max(64).optional().catch(undefined),
  action: z.string().trim().max(80).optional().catch(undefined),
  result: z.enum(['success', 'denied', 'error']).optional().catch(undefined),
  target: z.string().trim().max(200).optional().catch(undefined),
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

/** Inclusive day range in UTC: `to` covers the whole day. */
export function dateRange(filters: Pick<AuditFilters, 'from' | 'to'>): {
  start: Date | null;
  end: Date | null;
} {
  return {
    start: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null,
    end: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null,
  };
}

/**
 * One CSV cell: quoted, quotes doubled, and a leading `=`, `+`, `-`, `@`, tab or CR neutralized so
 * spreadsheet apps never execute an audit value as a formula.
 */
export function csvCell(value: string | null | undefined): string {
  const text = value ?? '';
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly (string | null | undefined)[]): string {
  return values.map(csvCell).join(',');
}

/** Query string for a filter set (empty values dropped), e.g. for pagination links. */
export function filtersQuery(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key !== 'page' && value !== undefined && value !== '') params.set(key, String(value));
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}
