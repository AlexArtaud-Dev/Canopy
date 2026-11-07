'use client';

import { CircleAlert, Copy, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/ui/empty';

import { useErrorMessage } from './use-error-message';

interface ErrorStateProps {
  code: string;
  params?: Readonly<Record<string, string | number>>;
  /** Request ID or error digest users can quote to an admin. */
  reference?: string | undefined;
  onRetry?: () => void;
  /** Extra actions (e.g. a link home); rendered after Retry. */
  children?: ReactNode;
}

/**
 * Inline error with the translated message for `code`, a retry action and a copyable reference.
 * Unknown codes fall back to `system.unexpected` so raw identifiers never reach users.
 */
export function ErrorState({ code, params, reference, onRetry, children }: ErrorStateProps) {
  const t = useTranslations('common.errorState');
  const errorMessage = useErrorMessage();

  const copyReference = async () => {
    if (!reference) return;
    await navigator.clipboard.writeText(reference);
    toast.success(t('copied'));
  };

  return (
    <Empty role="alert" className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-destructive">
          <CircleAlert aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t('title')}</EmptyTitle>
        <EmptyDescription>{errorMessage(code, params)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button onClick={onRetry}>
            <RotateCcw aria-hidden />
            {t('retry')}
          </Button>
        ) : null}
        {children}
      </EmptyContent>
      {reference ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground font-mono text-xs"
          onClick={() => void copyReference()}
          aria-label={t('copyReference', { reference })}
        >
          <Copy aria-hidden />
          {t('reference', { reference })}
        </Button>
      ) : null}
    </Empty>
  );
}
