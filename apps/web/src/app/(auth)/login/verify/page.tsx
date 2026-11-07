import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getSessionState, safeRedirectPath, TwoFactorContainer } from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.twoFactor');
  return { title: t('metaTitle') };
}

interface VerifyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Second sign-in step, only reachable with a session waiting for its second factor. */
export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { next } = await searchParams;
  const destination = typeof next === 'string' ? next : undefined;
  const state = await getSessionState();
  if (state.kind === 'active') redirect(safeRedirectPath(destination) as Route);
  if (state.kind === 'none') redirect('/login');

  const t = await getTranslations('auth.twoFactor');
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{t('title')}</h1>
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <TwoFactorContainer next={destination} />
      </CardContent>
    </Card>
  );
}
