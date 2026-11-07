'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { useFormError } from '@/shared/errors/use-error-message';
import { downloadText } from '@/shared/lib/download';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Spinner } from '@/shared/ui/spinner';

import { exportMyData } from './server/my-data';

/** "Your data" on the Account page: the RGPD access right, self-service. */
export function MyDataContainer() {
  const t = useTranslations('auth.myData');
  const toFormError = useFormError();
  const [pending, startTransition] = useTransition();

  const download = () => {
    startTransition(async () => {
      const result = await exportMyData();
      if (!result.ok) {
        toast.error(toFormError(result.error).message);
        return;
      }
      downloadText('canopy-my-data.json', result.data.json, 'application/json');
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={download} disabled={pending}>
          {pending ? <Spinner /> : <Download aria-hidden data-icon="inline-start" />}
          {t('download')}
        </Button>
      </CardContent>
    </Card>
  );
}
