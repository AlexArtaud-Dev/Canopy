'use client';

import {
  CheckCheck,
  CopyPlus,
  Download,
  FolderInput,
  FolderOpen,
  HardDrive,
  Link2,
  PencilLine,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';

import type { BrowserEntry } from '../server/browse';

export interface EntryMenuHandlers {
  onOpen: (entry: BrowserEntry) => void;
  onCopyPath: (entry: BrowserEntry) => void;
  onRename: (entry: BrowserEntry) => void;
  /** Moves the entry (or its selection) to the trash; permanent with Shift. */
  onDelete: (entry: BrowserEntry, permanent: boolean) => void;
  /** Downloads the entry, or the selection it belongs to (folders and several items as a zip). */
  onDownload: (entry: BrowserEntry) => void;
  /** Copy or move the entry (or the selection it belongs to) to a folder picked next. */
  onTransfer: (operation: 'copy' | 'move', entry: BrowserEntry) => void;
  /** Starts a background job measuring the folder; it shows up in the operations panel. */
  onFolderSize: (entry: BrowserEntry) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  /** Right-click (or long-press) on an unselected entry selects it first. */
  onMenuOpen: (entry: BrowserEntry) => void;
}

interface EntryMenuProps extends EntryMenuHandlers {
  entry: BrowserEntry;
  children: ReactNode;
}

/** Right-click menu of an entry; Radix opens it on long-press too, for touch screens. */
export function EntryMenu({ entry, children, ...handlers }: EntryMenuProps) {
  const t = useTranslations('files.browser.menu');
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) handlers.onMenuOpen(entry);
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {entry.isDirectory && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onOpen(entry);
            }}
          >
            <FolderOpen aria-hidden />
            {t('open')}
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {entry.isDirectory && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onFolderSize(entry);
            }}
          >
            <HardDrive aria-hidden />
            {t('folderSize')}
          </ContextMenuItem>
        )}
        {entry.actions.includes('download') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onDownload(entry);
            }}
          >
            <Download aria-hidden />
            {entry.isDirectory ? t('downloadZip') : t('download')}
          </ContextMenuItem>
        )}
        {entry.actions.includes('update') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onRename(entry);
            }}
          >
            <PencilLine aria-hidden />
            {t('rename')}
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {entry.actions.includes('copy') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onTransfer('copy', entry);
            }}
          >
            <CopyPlus aria-hidden />
            {t('copyTo')}
          </ContextMenuItem>
        )}
        {entry.actions.includes('move') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onTransfer('move', entry);
            }}
          >
            <FolderInput aria-hidden />
            {t('moveTo')}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => {
            handlers.onCopyPath(entry);
          }}
        >
          <Link2 aria-hidden />
          {t('copyPath')}
        </ContextMenuItem>
        {entry.actions.includes('delete') && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                handlers.onDelete(entry, false);
              }}
            >
              <Trash2 aria-hidden />
              {t('delete')}
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                handlers.onDelete(entry, true);
              }}
            >
              <Trash2 aria-hidden />
              {t('deletePermanently')}
              <ContextMenuShortcut>Shift Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handlers.onSelectAll}>
          <CheckCheck aria-hidden />
          {t('selectAll')}
          <ContextMenuShortcut>Ctrl A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlers.onRefresh}>
          <RefreshCw aria-hidden />
          {t('refresh')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
