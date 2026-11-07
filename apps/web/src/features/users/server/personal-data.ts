import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import {
  groupMembersTable,
  groupsTable,
  rolesTable,
  userRolesTable,
} from '@/features/access/server/access.schema';
import { auditEventsTable } from '@/features/audit/server/audit.schema';
import { sessionsTable, totpFactorsTable, usersTable } from '@/features/auth/server/auth.schema';
import { pathGrantsTable } from '@/features/files/server/files.schema';
import { mailOutboxTable } from '@/features/mail/server/mail.schema';

/** Audit entries in an export are capped; older ones remain available to administrators. */
const auditExportLimit = 5_000;

/**
 * Everything Canopy stores about one person (RGPD access right), as plain JSON. Secrets
 * (password hash, TOTP secret, recovery codes) are never included, only whether they exist.
 */
export async function collectPersonalData(userId: string) {
  const db = getDb();
  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.name,
      contactEmail: usersTable.contactEmail,
      locale: usersTable.locale,
      disabled: usersTable.disabled,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;

  const [roles, groups, sessions, totp, grants, auditEvents, emails] = await Promise.all([
    db
      .select({ name: rolesTable.name, key: rolesTable.key })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
      .where(eq(userRolesTable.userId, userId)),
    db
      .select({ name: groupsTable.name })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(eq(groupMembersTable.userId, userId)),
    db
      .select({
        createdAt: sessionsTable.createdAt,
        lastActiveAt: sessionsTable.updatedAt,
        ipAddress: sessionsTable.ipAddress,
        userAgent: sessionsTable.userAgent,
      })
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId)),
    db
      .select({ enabledAt: totpFactorsTable.enabledAt })
      .from(totpFactorsTable)
      .where(eq(totpFactorsTable.userId, userId)),
    db
      .select({
        path: pathGrantsTable.path,
        actions: pathGrantsTable.actions,
        effect: pathGrantsTable.effect,
      })
      .from(pathGrantsTable)
      .where(eq(pathGrantsTable.subjectId, userId)),
    db
      .select({
        occurredAt: auditEventsTable.occurredAt,
        action: auditEventsTable.action,
        result: auditEventsTable.result,
        target: auditEventsTable.target,
        ipAddress: sql<string | null>`host(${auditEventsTable.actorIp})`,
      })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.actorId, userId))
      .orderBy(desc(auditEventsTable.occurredAt))
      .limit(auditExportLimit),
    user.contactEmail
      ? db
          .select({
            subject: mailOutboxTable.subject,
            status: mailOutboxTable.status,
            createdAt: mailOutboxTable.createdAt,
          })
          .from(mailOutboxTable)
          .where(eq(mailOutboxTable.recipient, user.contactEmail))
      : Promise.resolve([]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: user,
    roles,
    groups,
    twoFactor: { enabled: totp.some((factor) => factor.enabledAt !== null) },
    sessions,
    folderAccess: grants,
    activity: auditEvents,
    emails,
  };
}

/** Personal data not removed by the account's cascade (it lives in the `app` schema). */
export async function deletePersonalLeftovers(
  tx: Pick<ReturnType<typeof getDb>, 'delete'>,
  contactEmail: string | null,
): Promise<void> {
  if (contactEmail) {
    await tx.delete(mailOutboxTable).where(eq(mailOutboxTable.recipient, contactEmail));
  }
}
