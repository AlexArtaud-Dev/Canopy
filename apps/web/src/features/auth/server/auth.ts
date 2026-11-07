import 'server-only';

import { randomUUID } from 'node:crypto';

import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { username } from 'better-auth/plugins/username';

import { parseServerEnv } from '@/shared/config/env';
import { getDb } from '@/shared/db/client';
import { deriveSecret } from '@/shared/secrets/secrets';

import { usernameSchema } from '../auth.utils';
import { accountsTable, sessionsTable, usersTable, verificationsTable } from './auth.schema';
import { hashPassword, verifyPassword } from './password';
import { hasTotpEnabled } from './totp-factor';

async function isDisabled(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ disabled: usersTable.disabled })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row?.disabled !== false;
}

/** Request header carrying the client IP we resolved; anything the client sent is overwritten. */
export const clientIpHeader = 'x-canopy-client-ip';

function createAuth(lifetimeSeconds: number) {
  const env = parseServerEnv(process.env);
  return betterAuth({
    appName: 'Canopy',
    baseURL: env.CANOPY_PUBLIC_URL,
    secret: deriveSecret('canopy.auth.cookies'),
    telemetry: { enabled: false },
    // Only server actions talk to Better Auth (no HTTP handler is mounted): they validate,
    // rate-limit and audit first, so the built-in limiter has nothing to see.
    rateLimit: { enabled: false },
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        user: usersTable,
        session: sessionsTable,
        account: accountsTable,
        verification: verificationsTable,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Accounts come from the setup wizard and administrators, never from a public form.
      disableSignUp: true,
      minPasswordLength: 1,
      maxPasswordLength: 1024,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        contactEmail: { type: 'string', required: false, input: false },
        disabled: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    session: {
      // Absolute lifetime for the row and the cookie; idle timeout and activity tracking are
      // ours (`current-session.ts`) because server components cannot rewrite cookies.
      expiresIn: lifetimeSeconds,
      disableSessionRefresh: true,
      additionalFields: {
        twoFactorPending: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Decided when the row is written, so a 2FA account never has a usable session before
          // its second factor, even for a moment.
          // Returning false refuses the session: disabled accounts cannot sign in.
          before: async (session) => {
            if (await isDisabled(session.userId)) return false;
            return {
              data: { ...session, twoFactorPending: await hasTotpEnabled(session.userId) },
            };
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'canopy',
      useSecureCookies: env.CANOPY_PUBLIC_URL.startsWith('https://'),
      // 'uuid' would leave ids to a column default; ours are generated here.
      database: { generateId: () => randomUUID() },
      // Full addresses: sessions list the device's IP, not its /64 (the default, made for limits).
      ipAddress: { ipAddressHeaders: [clientIpHeader], ipv6Subnet: 128 },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        usernameValidator: (value) => usernameSchema.safeParse(value).success,
      }),
      // Must stay last: copies Set-Cookie from Better Auth into the server action response.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: { lifetimeSeconds: number; auth: Auth } | undefined;

/** One instance per lifetime value: changing the setting applies to new sessions. */
export function getAuth(lifetimeSeconds: number): Auth {
  if (instance?.lifetimeSeconds !== lifetimeSeconds) {
    instance = { lifetimeSeconds, auth: createAuth(lifetimeSeconds) };
  }
  return instance.auth;
}
