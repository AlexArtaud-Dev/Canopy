'use server';

import { redirect } from 'next/navigation';

import { audit } from '@/features/audit/server/audit-writer';

import { authRequestHeaders, getConfiguredAuth, getSessionState } from './current-session';

/** Ends the session, including one still waiting for its second factor. */
export async function signOut(): Promise<never> {
  const state = await getSessionState();
  if (state.kind !== 'none') {
    const [{ auth }, headers] = await Promise.all([getConfiguredAuth(), authRequestHeaders()]);
    await auth.api.signOut({ headers });
    const actorId = state.kind === 'active' ? state.user.id : state.userId;
    await audit({ action: 'auth.sign_out', result: 'success', actorId });
  }
  redirect('/login');
}
