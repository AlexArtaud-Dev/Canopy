import { boolean, index, text, timestamp } from 'drizzle-orm/pg-core';

import { authSchema } from '@/shared/db/schemas.schema';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Better Auth's `user` model. Its `email` column is required and unique, but Canopy accounts may
 * have no email: `email` holds a synthetic, undeliverable login key (`*.invalid`) and the real,
 * optional address lives in `contact_email`.
 */
export const usersTable = authSchema.table('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  username: text('username').notNull().unique(),
  displayUsername: text('display_username'),
  contactEmail: text('contact_email'),
  /** Instance owner created by the setup wizard; roles and groups refine this in M4. */
  isAdmin: boolean('is_admin').notNull().default(false),
  ...timestamps,
});

export const sessionsTable = authSchema.table(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

/** Credentials per provider; Canopy only uses `credential` (argon2id password hash). */
export const accountsTable = authSchema.table(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    ...timestamps,
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verificationsTable = authSchema.table(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);
