'use client';

import { CheckCheck, Copy, FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
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
        <ContextMenuItem
          onSelect={() => {
            handlers.onCopyPath(entry);
          }}
        >
          <Copy aria-hidden />
          {t('copyPath')}
        </ContextMenuItem>
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
