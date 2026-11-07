import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getConfiguredAuth, isActionTokenUsable, SetPasswordContainer } from '@/features/auth';
import { actionTokenSchema } from '@/features/auth/action-token.utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.setPassword');
  return { title: t('metaTitle') };
}

interface SetPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Landing page of invitation and reset links. */
export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const { token } = await searchParams;
  const parsed = actionTokenSchema.safeParse(token);
  const [t, { policy }, usable] = await Promise.all([
    getTranslations('auth.setPassword'),
    getConfiguredAuth(),
    parsed.success ? isActionTokenUsable(parsed.data) : Promise.resolve(false),
  ]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{t('title')}</h1>
        </CardTitle>
        <CardDescription>{t('description', { min: policy.passwordMinLength })}</CardDescription>
      </CardHeader>
      <CardContent>
        {usable && parsed.success ? (
          <SetPasswordContainer token={parsed.data} passwordMinLength={policy.passwordMinLength} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{t('invalid')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
