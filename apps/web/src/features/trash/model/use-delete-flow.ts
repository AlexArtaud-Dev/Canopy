'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import type { DeletePlan } from '@canopy/contracts';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { filesystemQueryRoot } from '@/shared/query/query-keys';

import { deletePermanently, planDeletion, restoreItems, trashItems } from '../server/trash-actions';

export type DeleteDialog =
  | { kind: 'none' }
  | { kind: 'trash'; paths: string[]; plan: DeletePlan }
  /** Asked with Shift+Delete, or the selection does not fit the trash limits. */
  | { kind: 'permanent'; paths: string[]; plan: DeletePlan; asked: boolean };

/**
 * Deleting: the selection is measured first. If it fits the trash, a confirmation moves it there
 * with an Undo in the toast; otherwise (or when asked) a strong warning precedes a permanent
 * delete. The engine checks permissions and limits again.
 */
export function useDeleteFlow() {
  const t = useTranslations('trash.delete');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DeleteDialog>({ kind: 'none' });
  const [pending, setPending] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [filesystemQueryRoot] });
  const fail = (code: string, params?: Readonly<Record<string, string | number>>) => {
    toast.error(errorMessage(code, params));
  };

  const start = async (paths: string[], permanent: boolean) => {
    if (paths.length === 0) return;
    const planned = await planDeletion({ paths });
    if (!planned.ok) {
      fail(planned.error.code, planned.error.params);
      return;
    }
    const plan = planned.data;
    setDialog(
      permanent || !plan.fitsTrash
        ? { kind: 'permanent', paths, plan, asked: permanent }
        : { kind: 'trash', paths, plan },
    );
  };

  const undo = async (ids: string[]) => {
    const restored = await restoreItems({ ids });
    if (!restored.ok) {
      fail(restored.error.code, restored.error.params);
      return;
    }
    await refresh();
    toast.success(t('restored', { count: restored.data.length }));
  };

  const confirm = async () => {
    if (dialog.kind === 'none') return;
    setPending(true);
    try {
      if (dialog.kind === 'trash') {
        const moved = await trashItems({ paths: dialog.paths });
        if (!moved.ok) {
          fail(moved.error.code, moved.error.params);
          return;
        }
        await refresh();
        const ids = moved.data.map((item) => item.id);
        toast(t('moved', { count: ids.length }), {
          action: { label: t('undo'), onClick: () => void undo(ids) },
          // Long enough to notice a mistake and reach the button.
          duration: 10_000,
        });
      } else {
        const started = await deletePermanently({ paths: dialog.paths });
        if (!started.ok) {
          fail(started.error.code, started.error.params);
          return;
        }
        toast(t('permanentStarted', { count: dialog.paths.length }));
      }
    } finally {
      setPending(false);
      setDialog({ kind: 'none' });
    }
  };

  return {
    dialog,
    pending,
    start,
    confirm,
    close: () => {
      setDialog({ kind: 'none' });
    },
  };
}
