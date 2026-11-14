'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Inbox, Trash2, UserRound } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { ErrorState } from '@/shared/errors/error-state';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatBytes } from '@/features/files/browser.utils';

import { eraseDropOff, loadDropOffs, type ShareView } from '../server/share-actions';

interface DropOffsDialogProps {
  share: ShareView;
  onClose: () => void;
}

/**
 * Who sent files through an upload link, when, and which files. A record can be erased (a
 * depositor asked, or it is no longer needed); the files stay in the folder.
 */
export function DropOffsDialog({ share, onClose }: DropOffsDialogProps) {
  const t = useTranslations('shares.dropOffs');
  const format = useFormatter();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const queryKey = ['shares', 'drop-offs', share.id];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => loadDropOffs({ id: share.id }),
  });
  const erase = useMutation({
    mutationFn: (id: string) => eraseDropOff({ id }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      toast.success(t('erased'));
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title', { name: share.name })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] overflow-y-auto">
          {isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !data?.ok ? (
            <ErrorState code={data?.error.code ?? 'system.unexpected'} />
          ) : data.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox aria-hidden />
                </EmptyMedia>
                <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-3">
              {data.data.map((dropOff) => (
                <li key={dropOff.id} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <UserRound
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{dropOff.name ?? t('anonymous')}</span>
                        {dropOff.verified && (
                          <BadgeCheck
                            className="text-primary size-4 shrink-0"
                            aria-label={t('verified')}
                          />
                        )}
                      </p>
                      {dropOff.email && (
                        <p className="text-muted-foreground truncate text-xs">{dropOff.email}</p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {t('summary', {
                          count: dropOff.fileCount,
                          size: formatBytes(dropOff.byteCount, locale),
                          date: format.dateTime(new Date(dropOff.createdAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={erase.isPending}
                      aria-label={t('erase', { name: dropOff.name ?? t('anonymous') })}
                      onClick={() => {
                        erase.mutate(dropOff.id);
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <ul className="text-muted-foreground grid gap-0.5 ps-7 text-xs">
                    {dropOff.files.map((file, index) => (
                      <li key={`${file.name}-${String(index)}`} className="flex min-w-0 gap-2">
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatBytes(file.bytes, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
