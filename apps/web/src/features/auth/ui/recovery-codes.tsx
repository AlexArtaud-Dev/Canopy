'use client';

import { Copy, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/ui/button';

interface RecoveryCodesProps {
  codes: readonly string[];
  onCopy: () => void;
  onDownload: () => void;
  onDone: () => void;
}

export function RecoveryCodes({ codes, onCopy, onDownload, onDone }: RecoveryCodesProps) {
  const t = useTranslations('auth.totp');

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-medium">{t('recoveryTitle')}</h3>
        <p className="text-muted-foreground text-sm">{t('recoveryDescription')}</p>
      </div>
      <ul className="bg-muted/50 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={onCopy}>
          <Copy aria-hidden data-icon="inline-start" />
          {t('copy')}
        </Button>
        <Button variant="outline" onClick={onDownload}>
          <Download aria-hidden data-icon="inline-start" />
          {t('download')}
        </Button>
        <Button className="sm:ml-auto" onClick={onDone}>
          {t('done')}
        </Button>
      </div>
    </div>
  );
}
