'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useErrorMessage, useFormError } from '@/shared/errors/use-error-message';
import { downloadUrl } from '@/shared/lib/download';
import { filesystemQueryRoot } from '@/shared/query/query-keys';

import {
  downloadHref,
  type ConflictStrategy,
  type TransferConflict,
  type TransferOperation,
} from '../operations.utils';
import type { BrowserEntry } from '../server/browse';
import {
  createFolder,
  listSubfolders,
  planTransfer,
  renameEntry,
  startTransfer,
} from '../server/operations';
import { refreshStreamTicket } from '../server/stream-ticket';
import type { FolderLoader } from '../ui/folder-picker-dialog';

export type OperationDialog =
  | { kind: 'none' }
  | { kind: 'newFolder' }
  | { kind: 'rename'; entry: BrowserEntry }
  | { kind: 'pick'; operation: TransferOperation; sources: string[] }
  | {
      kind: 'conflicts';
      operation: TransferOperation;
      sources: string[];
      destination: string;
      conflicts: TransferConflict[];
      truncated: boolean;
    };

export interface Clipboard {
  operation: TransferOperation;
  sources: string[];
}

/**
 * Every write the file browser offers, with its dialogs: new folder, rename, copy and move (pick a
 * destination, resolve conflicts, start the job). The engine authorizes each step.
 */
export function useFileOperations(currentFolder: string) {
  const t = useTranslations('files.browser.ops');
  const jobsT = useTranslations('jobs.dock');
  const queryClient = useQueryClient();
  const toFormError = useFormError();
  const errorMessage = useErrorMessage();
  const [dialog, setDialog] = useState<OperationDialog>({ kind: 'none' });
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [filesystemQueryRoot] }),
    [queryClient],
  );
  const close = useCallback(() => {
    setDialog({ kind: 'none' });
  }, []);

  const submitNewFolder = async (name: string): Promise<FormErrorContent | null> => {
    const result = await createFolder({ parent: currentFolder, name });
    if (!result.ok) return toFormError(result.error);
    await refresh();
    toast.success(t('folderCreated', { name }));
    return null;
  };

  const submitRename = async (
    entry: BrowserEntry,
    name: string,
  ): Promise<FormErrorContent | null> => {
    if (name === entry.name) return null;
    const result = await renameEntry({ path: entry.path, name });
    if (!result.ok) return toFormError(result.error);
    await refresh();
    toast.success(t('renamed', { name }));
    return null;
  };

  const run = async (
    operation: TransferOperation,
    sources: string[],
    destination: string,
    choice: { strategy: ConflictStrategy; decisions: Record<string, ConflictStrategy> },
  ) => {
    const result = await startTransfer({ operation, sources, destination, ...choice });
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    const name = destination === '/' ? '/' : destination.slice(destination.lastIndexOf('/') + 1);
    toast(jobsT('started', { name }));
  };

  /** Checks conflicts first; runs at once when there are none. */
  const transfer = async (operation: TransferOperation, sources: string[], destination: string) => {
    const plan = await planTransfer({ operation, sources, destination });
    if (!plan.ok) {
      toast.error(errorMessage(plan.error.code, plan.error.params));
      setDialog({ kind: 'none' });
      return;
    }
    if (plan.data.conflicts.length === 0) {
      setDialog({ kind: 'none' });
      await run(operation, sources, destination, { strategy: 'skip', decisions: {} });
      return;
    }
    setDialog({ kind: 'conflicts', operation, sources, destination, ...plan.data });
  };

  const confirmConflicts = async (choice: {
    strategy: ConflictStrategy;
    decisions: Record<string, ConflictStrategy>;
  }) => {
    if (dialog.kind !== 'conflicts') return;
    setDialog({ kind: 'none' });
    await run(dialog.operation, dialog.sources, dialog.destination, choice);
  };

  const loadFolders: FolderLoader = async (path) => {
    const result = await listSubfolders({ path });
    return result.ok
      ? { ok: true, ...result.data }
      : { ok: false, error: toFormError(result.error) };
  };

  const copyToClipboard = (operation: TransferOperation, sources: string[]) => {
    setClipboard({ operation, sources });
    const count = sources.length;
    toast(
      operation === 'copy' ? t('copiedToClipboard', { count }) : t('cutToClipboard', { count }),
    );
  };

  const paste = async () => {
    if (!clipboard) return;
    await transfer(clipboard.operation, clipboard.sources, currentFolder);
    // A cut is used once; a copy can be pasted again elsewhere.
    if (clipboard.operation === 'move') setClipboard(null);
  };

  /** A fresh stream ticket (HttpOnly cookie) first, then the browser downloads on its own. */
  const download = async (items: readonly BrowserEntry[]) => {
    const href = downloadHref(items);
    if (!href) return;
    const ticket = await refreshStreamTicket();
    if (!ticket.ok) {
      toast.error(errorMessage(ticket.error.code, ticket.error.params));
      return;
    }
    downloadUrl(href);
  };

  return {
    dialog,
    download,
    close,
    clipboard,
    openNewFolder: () => {
      setDialog({ kind: 'newFolder' });
    },
    openRename: (entry: BrowserEntry) => {
      setDialog({ kind: 'rename', entry });
    },
    openPicker: (operation: TransferOperation, sources: string[]) => {
      setDialog({ kind: 'pick', operation, sources });
    },
    submitNewFolder,
    submitRename,
    transfer,
    confirmConflicts,
    loadFolders,
    copyToClipboard,
    paste,
  };
}
