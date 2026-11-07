import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  hasTotpEnabled,
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
  const { user } = await requireSession();
  const [t, totpEnabled, remainingCodes] = await Promise.all([
    getTranslations('auth.accountPage'),
    hasTotpEnabled(user.id),
    remainingRecoveryCodes(user.id),
  ]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <section aria-labelledby="security-heading" className="grid gap-3">
          <h2 id="security-heading" className="text-muted-foreground text-sm font-medium">
            {t('security')}
          </h2>
          <TotpContainer enabled={totpEnabled} remainingCodes={remainingCodes} />
        </section>
      </main>
    </>
  );
}
