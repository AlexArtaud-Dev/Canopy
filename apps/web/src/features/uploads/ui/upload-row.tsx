'use client';

import { CircleAlert, CircleCheck, CircleSlash, RotateCcw, Square, Upload, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';
import { formatBytes } from '@/features/files/browser.utils';

import { isActive, uploadPercent, uploadRate, type UploadItem } from '../uploads.utils';

interface UploadRowProps {
  item: UploadItem;
  now: number;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}

function StateIcon({ item }: { item: UploadItem }) {
  const className = 'size-4 shrink-0';
  if (isActive(item)) return <Upload className={cn(className, 'text-primary')} aria-hidden />;
  if (item.state === 'done')
    return <CircleCheck className={cn(className, 'text-primary')} aria-hidden />;
  if (item.state === 'failed')
    return <CircleAlert className={cn(className, 'text-destructive')} aria-hidden />;
  return <CircleSlash className={cn(className, 'text-muted-foreground')} aria-hidden />;
}

/** One file being sent: progress and speed, then where it landed or why it did not. */
export function UploadRow({ item, now, onCancel, onRetry, onDismiss }: UploadRowProps) {
  const t = useTranslations('jobs.uploads');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const active = isActive(item);
  const rate = uploadRate(item, now);
  const stored = item.storedAt?.slice(item.storedAt.lastIndexOf('/') + 1);

  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <StateIcon item={item} />
        <p className="min-w-0 flex-1 truncate text-sm" title={item.name}>
          <span className="font-medium">{t('upload')}</span>
          <span className="text-muted-foreground"> · {item.name}</span>
        </p>
        {active && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('cancel', { name: item.name })}
            onClick={() => {
              onCancel(item.id);
            }}
          >
            <Square aria-hidden />
          </Button>
        )}
        {item.state === 'failed' && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('retry', { name: item.name })}
            onClick={() => {
              onRetry(item.id);
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
        {!active && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('dismiss', { name: item.name })}
            onClick={() => {
              onDismiss(item.id);
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {active && (
        <>
          <Progress
            value={uploadPercent(item)}
            aria-label={t('progress', { name: item.name })}
            className="h-1.5"
          />
          <p className="text-muted-foreground text-xs tabular-nums">
            {item.state === 'queued'
              ? t('queued')
              : [
                  `${formatBytes(item.sent, locale)} / ${formatBytes(item.size, locale)}`,
                  rate === null ? null : t('rate', { rate: formatBytes(rate, locale) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </>
      )}
      {item.state === 'done' && (
        <p className="text-muted-foreground text-xs">
          {stored && stored !== item.name
            ? t('storedAs', { name: stored })
            : t('done', { size: formatBytes(item.size, locale) })}
        </p>
      )}
      {item.state === 'skipped' && <p className="text-muted-foreground text-xs">{t('skipped')}</p>}
      {item.state === 'cancelled' && (
        <p className="text-muted-foreground text-xs">{t('cancelled')}</p>
      )}
      {item.state === 'failed' && (
        <p className="text-destructive text-xs">
          {errorMessage(item.errorCode ?? 'system.unexpected')}
        </p>
      )}
    </li>
  );
}
