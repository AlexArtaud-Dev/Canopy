'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, File, Folder, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { TrashListing } from '@canopy/contracts';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { filesystemQueryRoot } from '@/shared/query/query-keys';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { formatBytes } from '@/features/files/browser.utils';

import { emptyTrash, loadTrash, restoreItems } from './server/trash-actions';
import { daysLeft, originalFolder } from './trash.utils';

const trashQueryKey = [filesystemQueryRoot, 'trash'] as const;

/** Items in the trash: restore them, or delete them for good (one by one or all at once). */
export function TrashContainer({
  initial,
  showOwner,
  ownerNames,
}: {
  initial: TrashListing;
  showOwner: boolean;
  /** Usernames by account id (administrators only). */
  ownerNames: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('trash.page');
  const format = useFormatter();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  // Refreshed when a job finishes (emptying) and after each action.
  const { data } = useQuery({
    queryKey: trashQueryKey,
    queryFn: async () => {
      const result = await loadTrash();
      return result.ok ? result.data : initial;
    },
    initialData: initial,
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<'selection' | 'all' | null>(null);
  const [pending, setPending] = useState(false);
  const [now] = useState(() => new Date());
  const items = data.items;
  const visibleSelection = useMemo(
    () => new Set(items.filter((item) => selected.has(item.id)).map((item) => item.id)),
    [items, selected],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: [filesystemQueryRoot] });

  const restore = async (ids: string[]) => {
    setPending(true);
    const result = await restoreItems({ ids });
    setPending(false);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    setSelected(new Set());
    await refresh();
    toast.success(t('restored', { count: result.data.length }));
  };

  const remove = async () => {
    setPending(true);
    const ids = confirming === 'all' ? [] : [...visibleSelection];
    const result = await emptyTrash({ ids });
    setPending(false);
    setConfirming(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    setSelected(new Set());
    toast(t('removing'));
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          {t('limits', {
            days: data.limits.retentionDays,
            size: formatBytes(data.limits.maxBytes, locale),
            files: data.limits.maxFiles,
          })}
        </p>
        {visibleSelection.size > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void restore([...visibleSelection])}
            >
              <ArchiveRestore aria-hidden data-icon="inline-start" />
              {t('restoreSelected', { count: visibleSelection.size })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirming('selection');
              }}
            >
              <Trash2 aria-hidden data-icon="inline-start" />
              {t('deleteSelected', { count: visibleSelection.size })}
            </Button>
          </>
        )}
        {items.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => {
              setConfirming('all');
            }}
          >
            {t('empty')}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 aria-hidden />
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
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t('selectAll')}
                    checked={visibleSelection.size === items.length}
                    onCheckedChange={(checked) => {
                      setSelected(
                        checked === true ? new Set(items.map((item) => item.id)) : new Set(),
                      );
                    }}
                  />
                </TableHead>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.location')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('columns.deleted')}</TableHead>
                {showOwner && (
                  <TableHead className="hidden lg:table-cell">{t('columns.owner')}</TableHead>
                )}
                <TableHead className="text-right">{t('columns.size')}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const Icon = item.isDirectory ? Folder : File;
                const left = daysLeft(item.deletedAt, data.limits.retentionDays, now);
                return (
                  <TableRow
                    key={item.id}
                    data-state={selected.has(item.id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={t('select', { name: item.name })}
                        checked={selected.has(item.id)}
                        onCheckedChange={() => {
                          toggle(item.id);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          className={
                            item.isDirectory
                              ? 'fill-primary/15 text-primary size-4'
                              : 'text-muted-foreground size-4'
                          }
                          aria-hidden
                        />
                        <span className="truncate font-medium">{item.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-64 truncate md:table-cell">
                      {originalFolder(item.originalPath)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {format.dateTime(new Date(item.deletedAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      <span className="block text-xs">{t('daysLeft', { count: left })}</span>
                    </TableCell>
                    {showOwner && (
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {ownerNames[item.deletedBy] ?? item.deletedBy}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {item.measured ? formatBytes(item.bytes, locale) : t('measuring')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={t('restore', { name: item.name })}
                        onClick={() => void restore([item.id])}
                      >
                        <ArchiveRestore aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        destructive
        title={
          confirming === 'all'
            ? t('emptyTitleConfirm')
            : t('deleteTitle', { count: visibleSelection.size })
        }
        description={t('deleteWarning')}
        confirmLabel={confirming === 'all' ? t('empty') : t('deleteConfirm')}
        pending={pending}
        onConfirm={() => void remove()}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      />
    </div>
  );
}
