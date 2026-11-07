import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getCurrentSession, hasAnyUser, LoginContainer, safeRedirectPath } from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  const destination = typeof next === 'string' ? next : undefined;
  if (await getCurrentSession()) redirect(safeRedirectPath(destination) as Route);
  if (!(await hasAnyUser())) redirect('/setup');

  const t = await getTranslations('auth.login');
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{t('title')}</h1>
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginContainer next={destination} />
      </CardContent>
    </Card>
  );
}
