'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, File, Folder, Inbox, Link2, LockKeyhole, Unlink } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { formatBytes } from '@/features/files/browser.utils';

import { loadShares, revokeShare, type ShareView } from './server/share-actions';
import { DropOffsDialog } from './ui/drop-offs-dialog';

interface SharesContainerProps {
  initial: ShareView[];
  /** The person may see and revoke everyone's links. */
  canManage: boolean;
  /** Usernames by account id (managers only). */
  ownerNames: Readonly<Record<string, string>>;
}

/** The person's share links (or everyone's for managers): status, use, copy and revoke. */
export function SharesContainer({ initial, canManage, ownerNames }: SharesContainerProps) {
  const t = useTranslations('shares.page');
  const format = useFormatter();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [revoking, setRevoking] = useState<ShareView | null>(null);
  const [history, setHistory] = useState<ShareView | null>(null);
  const [pending, setPending] = useState(false);
  const { data } = useQuery({
    queryKey: ['shares', scope],
    queryFn: async () => {
      const result = await loadShares({ all: scope === 'all' });
      return result.ok ? result.data : [];
    },
    initialData: scope === 'mine' ? initial : undefined,
  });
  const shares = data ?? [];

  const revoke = async () => {
    if (!revoking) return;
    setPending(true);
    const result = await revokeShare({ id: revoking.id });
    setPending(false);
    setRevoking(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['shares'] });
    toast.success(t('revoked'));
  };

  const copy = (link: string) => {
    void navigator.clipboard.writeText(link).then(() => toast.success(t('copied')));
  };

  return (
    <div className="grid gap-4">
      {canManage && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={scope}
          onValueChange={(value) => {
            if (value === 'mine' || value === 'all') setScope(value);
          }}
          className="justify-self-start"
        >
          <ToggleGroupItem value="mine">{t('mine')}</ToggleGroupItem>
          <ToggleGroupItem value="all">{t('all')}</ToggleGroupItem>
        </ToggleGroup>
      )}
      {shares.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2 aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.item')}</TableHead>
                {scope === 'all' && (
                  <TableHead className="hidden lg:table-cell">{t('columns.owner')}</TableHead>
                )}
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('columns.expires')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.use')}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.map((share) => {
                const Icon = share.isDirectory ? Folder : File;
                return (
                  <TableRow key={share.id}>
                    {/* Takes what the other columns leave and truncates: actions stay in view. */}
                    <TableCell className="w-full max-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          className={
                            share.isDirectory
                              ? 'fill-primary/15 text-primary size-4 shrink-0'
                              : 'text-muted-foreground size-4 shrink-0'
                          }
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{share.name}</span>
                            {share.hasPassword && (
                              <LockKeyhole
                                className="text-muted-foreground size-3.5 shrink-0"
                                aria-label={t('protected')}
                              />
                            )}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {share.kind === 'upload' ? t('kindUpload') : t('kindDownload')} ·{' '}
                            {share.path}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    {scope === 'all' && (
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {ownerNames[share.ownerId] ?? share.ownerId}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={share.status === 'active' ? 'secondary' : 'outline'}>
                        {/* i18n-dynamic: shares.page.status */}
                        {t(`status.${share.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {format.dateTime(new Date(share.expiresAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden tabular-nums md:table-cell">
                      {share.kind === 'upload'
                        ? t('received', {
                            count: share.uploadedFiles,
                            size: formatBytes(share.uploadedBytes, locale),
                          })
                        : share.maxDownloads === null
                          ? share.downloadCount
                          : `${String(share.downloadCount)} / ${String(share.maxDownloads)}`}
                    </TableCell>
                    <TableCell>
                      <span className="flex justify-end gap-1">
                        {share.kind === 'upload' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('dropOffs', {
                              name: share.name,
                              count: share.dropOffCount,
                            })}
                            onClick={() => {
                              setHistory(share);
                            }}
                          >
                            <Inbox aria-hidden />
                            <span className="tabular-nums">{share.dropOffCount}</span>
                          </Button>
                        )}
                        {share.link && share.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('copy', { name: share.name })}
                            onClick={() => {
                              if (share.link) copy(share.link);
                            }}
                          >
                            <Copy aria-hidden />
                          </Button>
                        )}
                        {share.status !== 'revoked' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('revoke', { name: share.name })}
                            onClick={() => {
                              setRevoking(share);
                            }}
                          >
                            <Unlink aria-hidden />
                          </Button>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {history && (
        <DropOffsDialog
          key={history.id}
          share={history}
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
      <ConfirmDialog
        open={revoking !== null}
        destructive
        title={t('revokeTitle', { name: revoking?.name ?? '' })}
        description={t('revokeDescription')}
        confirmLabel={t('revokeConfirm')}
        pending={pending}
        onConfirm={() => void revoke()}
        onOpenChange={(open) => {
          if (!open && !pending) setRevoking(null);
        }}
      />
    </div>
  );
}
