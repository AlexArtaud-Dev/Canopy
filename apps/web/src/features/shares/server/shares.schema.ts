import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

/**
 * Share links. The token itself is never stored in clear: `token_hash` finds a link from its
 * URL, `token_sealed` (encrypted) lets the owner copy the link again.
 */
export const sharesTable = appSchema.table(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenSealed: text('token_sealed').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Clean virtual path of the shared file or folder. */
    path: text('path').notNull(),
    name: text('name').notNull(),
    isDirectory: boolean('is_directory').notNull(),
    /** `download`: visitors get what was shared; `upload`: visitors send files into the folder. */
    kind: text('kind', { enum: ['download', 'upload'] })
      .notNull()
      .default('download'),
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    /** Upload links: lowercase extensions without the dot (null: any type). */
    allowedExtensions: text('allowed_extensions').array(),
    maxFileBytes: bigint('max_file_bytes', { mode: 'number' }),
    maxTotalBytes: bigint('max_total_bytes', { mode: 'number' }),
    maxFiles: integer('max_files'),
    /**
     * Upload links: what depositors give before sending (`none`, a declared name and e-mail, or
     * an e-mail verified by a code).
     */
    identity: text('identity', { enum: ['none', 'declared', 'verified'] })
      .notNull()
      .default('none'),
    /** Counted when an upload starts (reserved), so limits hold even for uploads in flight. */
    uploadedBytes: bigint('uploaded_bytes', { mode: 'number' }).notNull().default(0),
    uploadedFiles: integer('uploaded_files').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessAt: timestamp('last_access_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shares_owner_id_idx').on(table.ownerId),
    index('shares_expires_at_idx').on(table.expiresAt),
    check('shares_path_check', sql`${table.path} LIKE '/%'`),
    check('shares_kind_check', sql`${table.kind} IN ('download', 'upload')`),
    check('shares_identity_check', sql`${table.identity} IN ('none', 'declared', 'verified')`),
    check(
      'shares_max_downloads_check',
      sql`${table.maxDownloads} IS NULL OR ${table.maxDownloads} > 0`,
    ),
  ],
);

/**
 * One visit that sends files through an upload link: who (when the link asks), when, how much.
 * Name and e-mail are personal data: kept for the retention administrators set, erasable.
 */
export const shareDropOffsTable = appSchema.table(
  'share_drop_offs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => sharesTable.id, { onDelete: 'cascade' }),
    name: text('name'),
    email: text('email'),
    /** Set once the depositor typed the code sent to their e-mail. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** The pending code, hashed; cleared once used. */
    codeHash: text('code_hash'),
    codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
    codeAttempts: integer('code_attempts').notNull().default(0),
    fileCount: integer('file_count').notNull().default(0),
    byteCount: bigint('byte_count', { mode: 'number' }).notNull().default(0),
    lastUploadAt: timestamp('last_upload_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('share_drop_offs_share_idx').on(table.shareId, table.createdAt),
    index('share_drop_offs_created_idx').on(table.createdAt),
  ],
);

/** The files of a drop-off, as they were announced when each upload started. */
export const shareDropOffFilesTable = appSchema.table(
  'share_drop_off_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dropOffId: uuid('drop_off_id')
      .notNull()
      .references(() => shareDropOffsTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('share_drop_off_files_drop_off_idx').on(table.dropOffId)],
);
