import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  AccountContainer,
  getConfiguredAuth,
  hasTotpEnabled,
  listSessions,
  MyDataContainer,
  remainingRecoveryCodes,
  requireSession,
  TotpContainer,
} from '@/features/auth';
import { PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.accountPage');
  return { title: t('metaTitle') };
}

export default async function AccountPage() {
  const { user, sessionId } = await requireSession();
  const [t, { policy }, totpEnabled, remainingCodes, sessions] = await Promise.all([
    getTranslations('auth.accountPage'),
    getConfiguredAuth(),
    hasTotpEnabled(user.id),
    remainingRecoveryCodes(user.id),
    listSessions(user.id, sessionId),
  ]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <AccountContainer
          username={user.username}
          profile={{ displayName: user.name, contactEmail: user.contactEmail ?? '' }}
          passwordMinLength={policy.passwordMinLength}
          sessions={sessions}
        />
        <TotpContainer enabled={totpEnabled} remainingCodes={remainingCodes} />
        <MyDataContainer />
      </main>
    </>
  );
}
