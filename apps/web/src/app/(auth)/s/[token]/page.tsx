import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PublicShareContainer } from '@/features/shares';
import { loadPublicShare } from '@/features/shares/server/public-share';
import { sharedPathSchema } from '@/features/shares/shares.utils';

interface SharePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shares.public');
  // Shared names stay out of titles, previews and search engines.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** A share link, opened by anyone who has it (no account needed). */
export default async function SharePage({ params, searchParams }: SharePageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const path = sharedPathSchema.catch('/').parse(query.path);
  const share = await loadPublicShare(token, path);
  return <PublicShareContainer token={token} share={share} />;
}
