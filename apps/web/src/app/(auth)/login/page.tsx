import { Mail } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  getCurrentSession,
  hasAnyUser,
  isMagicLinkAvailable,
  LoginContainer,
  safeRedirectPath,
} from '@/features/auth';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const destination = typeof next === 'string' ? next : undefined;
  if (await getCurrentSession()) redirect(safeRedirectPath(destination) as Route);
  if (!(await hasAnyUser())) redirect('/setup');

  const [t, magicLink] = await Promise.all([getTranslations('auth.login'), isMagicLinkAvailable()]);
  const linkHref = destination
    ? `/login/link?next=${encodeURIComponent(destination)}`
    : '/login/link';
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{t('title')}</h1>
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginContainer next={destination} />
        {magicLink && (
          <>
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="bg-border h-px flex-1" />
              {t('or')}
              <span className="bg-border h-px flex-1" />
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href={linkHref as Route}>
                <Mail aria-hidden data-icon="inline-start" />
                {t('magicLink')}
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
