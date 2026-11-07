'use client';

import { ArrowRight, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/ui/button';

export function SetupDone({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('auth.setup.done');

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <CircleCheck className="size-6" aria-hidden />
      </span>
      <Button size="lg" className="w-full" onClick={onOpen} autoFocus>
        {t('open')}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </div>
  );
}
