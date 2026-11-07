import 'server-only';

import { appRegistry } from '@/modules';
import { getDb } from '@/shared/db/client';
import { getRequestContext } from '@/shared/request/request-context';

import { isAuditAction, sanitizeMeta, type AuditResult } from '../audit.utils';
import { auditEventsTable } from './audit.schema';

export interface AuditEntry {
  /** `<module>.<action>`, declared in the module's `auditActions`. */
  action: string;
  result: AuditResult;
  /** Virtual path or entity id the action applied to. */
  target?: string;
  /** Null for anonymous attempts (failed logins); filled from the session once auth exists. */
  actorId?: string | null;
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * Appends one audit event with the request's ID and client IP. Called by every state-changing
 * server action and for denied attempts. Failing to audit fails the action: no silent changes.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const context = await getRequestContext();
  if (!isAuditAction(entry.action) || !appRegistry.auditActions.has(entry.action)) {
    // A typo here would hide events from the viewer's labels and filters; surface it loudly.
    context.logger.error('undeclared audit action', { action: entry.action });
  }
  await getDb()
    .insert(auditEventsTable)
    .values({
      action: entry.action,
      result: entry.result,
      target: entry.target ?? null,
      actorId: entry.actorId ?? null,
      actorIp: context.clientIp ?? null,
      requestId: context.requestId,
      meta: sanitizeMeta(entry.meta ?? {}),
    });
}
