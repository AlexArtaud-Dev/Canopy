'use server';

import { redirect } from 'next/navigation';

import { audit } from '@/features/audit/server/audit-writer';

import { authRequestHeaders, getConfiguredAuth, getCurrentSession } from './current-session';

export async function signOut(): Promise<never> {
  const session = await getCurrentSession();
  if (session) {
    const [{ auth }, headers] = await Promise.all([getConfiguredAuth(), authRequestHeaders()]);
    await auth.api.signOut({ headers });
    await audit({ action: 'auth.sign_out', result: 'success', actorId: session.user.id });
  }
  redirect('/login');
}
