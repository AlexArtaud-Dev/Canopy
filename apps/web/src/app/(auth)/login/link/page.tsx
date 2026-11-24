import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  getCurrentSession,
  isMagicLinkAvailable,
  MagicLinkRequestContainer,
  MagicLinkSignInContainer,
  safeRedirectPath,
} from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.magicLink');
  return { title: t('metaTitle') };
}

interface MagicLinkPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Without a token: ask for a link. With one (from the e-mail): confirm signing in. */
export default async function MagicLinkPage({ searchParams }: MagicLinkPageProps) {
  const { token, next } = await searchParams;
  const destination = typeof next === 'string' ? next : undefined;
  if (await getCurrentSession()) redirect(safeRedirectPath(destination) as Route);
  if (typeof token !== 'string' && !(await isMagicLinkAvailable())) redirect('/login');

  const t = await getTranslations('auth.magicLink');
  const confirming = typeof token === 'string';
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{confirming ? t('confirmTitle') : t('title')}</h1>
        </CardTitle>
        <CardDescription>{confirming ? t('confirmDescription') : t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {confirming ? (
          <MagicLinkSignInContainer token={token} {...(destination ? { next: destination } : {})} />
        ) : (
          <MagicLinkRequestContainer />
        )}
      </CardContent>
    </Card>
  );
}
