import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getSessionState, TotpContainer } from '@/features/auth';
import { Button } from '@/shared/ui/button';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.enforcedTwoFactor');
  return { title: t('title') };
}

/** Reached when a group requires 2FA and the user has none: the only page left open. */
export default async function EnforcedTwoFactorPage() {
  const state = await getSessionState();
  if (state.kind === 'none') redirect('/login');
  if (state.kind === 'pending') redirect('/login/verify');
  if (!state.user.twoFactorSetupRequired) redirect('/');

  const t = await getTranslations('auth.enforcedTwoFactor');
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div className="grid gap-1 text-center">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>
      <TotpContainer enabled={false} remainingCodes={0} />
      <Button asChild variant="ghost" className="justify-self-center">
        <Link href="/">
          {t('continue')}
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
