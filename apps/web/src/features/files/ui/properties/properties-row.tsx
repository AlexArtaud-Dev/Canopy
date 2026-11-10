'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';

/** One label / value line of the details. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations('files.properties');
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      className="shrink-0"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => toast.success(t('copied')),
          () => toast.error(t('copyFailed')),
        );
      }}
    >
      <Copy aria-hidden />
    </Button>
  );
}
