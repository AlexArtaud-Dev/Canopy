'use client';

import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { formatBytes } from '@/features/files/browser.utils';

import type { DeleteDialog } from '../model/use-delete-flow';

interface DeleteDialogsProps {
  dialog: DeleteDialog;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** The confirmation for the trash, or the strong warning before a permanent delete. */
export function DeleteDialogs({ dialog, pending, onConfirm, onClose }: DeleteDialogsProps) {
  const t = useTranslations('trash.delete');
  const locale = useLocale();
  if (dialog.kind === 'none') return null;
  const count = dialog.paths.length;
  const size = formatBytes(dialog.plan.bytes, locale);
  const onOpenChange = (open: boolean) => {
    if (!open && !pending) onClose();
  };

  if (dialog.kind === 'trash') {
    return (
      <ConfirmDialog
        open
        title={t('trashTitle', { count })}
        description={t('trashDescription', { count, size, days: dialog.plan.limits.retentionDays })}
        confirmLabel={t('trashConfirm')}
        pending={pending}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    );
  }

  const reason = dialog.asked
    ? t('permanentAsked')
    : dialog.plan.complete
      ? t('permanentTooBig', {
          max: formatBytes(dialog.plan.limits.maxBytes, locale),
          files: dialog.plan.limits.maxFiles,
        })
      : t('permanentUnmeasured');
  return (
    <ConfirmDialog
      open
      destructive
      title={t('permanentTitle', { count })}
      description={`${reason} ${
        dialog.plan.complete ? t('permanentSize', { size, files: dialog.plan.files }) : ''
      } ${t('permanentWarning')}`}
      confirmLabel={t('permanentConfirm')}
      pending={pending}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />
  );
}
