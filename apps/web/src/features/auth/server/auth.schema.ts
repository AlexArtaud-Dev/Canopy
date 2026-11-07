import { bigint, boolean, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  /** Disabled accounts cannot sign in; their sessions are ended when disabled. */
  disabled: boolean('disabled').notNull().default(false),
  /** Last UI language, so emails reach people in their own language. */
  locale: text('locale'),
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
    /** Password accepted, second factor not yet: the session grants nothing. */
    twoFactorPending: boolean('two_factor_pending').notNull().default(false),
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

/** One authenticator per user. `enabledAt` is null while enrolment awaits its first code. */
export const totpFactorsTable = authSchema.table('totp_factors', {
  userId: text('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  /** `sealSecret(base32, 'auth.totp:<userId>')`. */
  secret: text('secret').notNull(),
  /** Last accepted time step: codes cannot be replayed. */
  lastUsedStep: bigint('last_used_step', { mode: 'number' }),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One-time recovery codes, stored as SHA-256 of the normalized code. */
export const recoveryCodesTable = authSchema.table(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [index('recovery_codes_user_id_idx').on(table.userId)],
);

/**
 * One-time links (invitation, password reset). Only the SHA-256 of the token is stored: a
 * database leak does not hand out working links.
 */
export const actionTokensTable = authSchema.table(
  'action_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['invitation', 'password_reset'] }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('action_tokens_user_id_idx').on(table.userId)],
);
