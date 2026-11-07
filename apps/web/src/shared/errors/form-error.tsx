'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';

export interface FormErrorContent {
  /** Already translated. */
  message: string;
  /** Request ID users can quote to an administrator (only useful for system failures). */
  reference?: string | undefined;
}

/** Error banner at the top of a form, announced to screen readers. */
export function FormError({ title, error }: { title?: string; error: FormErrorContent }) {
  const t = useTranslations('common.errorState');
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>
        <p>{error.message}</p>
        {error.reference && (
          <p className="font-mono text-xs opacity-80">
            {t('reference', { reference: error.reference })}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
