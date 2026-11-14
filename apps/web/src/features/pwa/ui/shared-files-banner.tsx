'use client';

import { Share2, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

import { useSharedFiles } from '../model/shared-files';

interface SharedFilesBannerProps {
  /** The folder open in the browser accepts uploads from this person. */
  canUpload: boolean;
  onUpload: (files: File[]) => void;
}

/**
 * Files shared from the phone wait here, above the folder: the person browses to where they go
 * and uploads them, or lets them go. Nothing shows when nothing was shared.
 */
export function SharedFilesBanner({ canUpload, onUpload }: SharedFilesBannerProps) {
  const t = useTranslations('pwa.shared');
  const { files, clear } = useSharedFiles();
  if (files.length === 0) return null;
  const names = files.map((file) => file.name).join(', ');

  return (
    <Alert className="mx-2 mt-2 w-auto sm:mx-4" aria-live="polite">
      <Share2 aria-hidden />
      <AlertTitle>{t('title', { count: files.length })}</AlertTitle>
      <AlertDescription>
        <p className="w-full truncate" title={names}>
          {names}
        </p>
        <p>{canUpload ? t('pick') : t('notHere')}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canUpload}
            onClick={() => {
              onUpload([...files]);
              clear();
            }}
          >
            <Upload aria-hidden />
            {t('upload')}
          </Button>
          <Button size="sm" variant="ghost" onClick={clear}>
            <X aria-hidden />
            {t('discard')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
