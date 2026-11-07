import 'server-only';

import { randomUUID } from 'node:crypto';

import { AppBaseError } from '@/shared/lib/errors';

import { syntheticEmail } from '../auth.utils';
import { getConfiguredAuth } from './current-session';
import { hashPassword } from './password';

export interface AccountDraft {
  username: string;
  displayName?: string | undefined;
  contactEmail?: string | undefined;
  password: string;
  isAdmin: boolean;
}

/**
 * Creates a local account with an argon2id credential. Callers authorize and audit; this is the
 * single path for the setup wizard and, later, administrators.
 */
export async function createAccount(draft: AccountDraft): Promise<{ id: string }> {
  const { auth } = await getConfiguredAuth();
  const context = await auth.$context;
  const username = draft.username.toLowerCase();

  const taken = await context.adapter.findOne({
    model: 'user',
    where: [{ field: 'username', value: username }],
  });
  if (taken) {
    throw new AppBaseError('auth.username_taken', 'username already exists');
  }

  const user = await context.internalAdapter.createUser(
    {
      name: draft.displayName?.trim() ? draft.displayName.trim() : draft.username,
      email: syntheticEmail(randomUUID()),
      emailVerified: false,
      username,
      displayUsername: draft.username,
      contactEmail: draft.contactEmail ?? null,
      isAdmin: draft.isAdmin,
    },
    { method: 'admin' },
  );
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await hashPassword(draft.password),
  });
  return { id: user.id };
}
