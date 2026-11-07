import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireSession, SetupContainer } from '@/features/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.setup');
  return { title: t('metaTitle') };
}

/** Last wizard step, reached right after `completeSetup` signs the new administrator in. */
export default async function SetupDonePage() {
  await requireSession();
  return <SetupContainer initialStep="done" />;
}
