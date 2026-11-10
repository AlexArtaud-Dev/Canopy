'use client';

import type { CommandEntry } from '@canopy/contracts';
import { CheckCheck, FolderPlus, RefreshCw, Star, StarOff } from 'lucide-react';
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
import type { PluginMenu } from '@/features/commands';

import { PluginsSubmenu } from './plugins-submenu';

interface FolderMenuProps {
  children: ReactNode;
  /** Plugin commands to offer on the open folder (none when it cannot be changed). */
  plugins: readonly PluginMenu[];
  canCreate: boolean;
  onPluginCommand: (command: CommandEntry) => void;
  onNewFolder: () => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  /** Pinned state of the open folder; null at the root, which cannot be pinned. */
  favorite: boolean | null;
  onToggleFavorite: () => void;
}

/**
 * Right-click (or long-press) on empty space: actions on the open folder. An entry's own menu
 * takes precedence, since Radix skips a trigger once a nested one has handled the event.
 */
export function FolderMenu({
  children,
  plugins,
  canCreate,
  onPluginCommand,
  onNewFolder,
  onSelectAll,
  onRefresh,
  favorite,
  onToggleFavorite,
}: FolderMenuProps) {
  const t = useTranslations('files.browser');
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {canCreate && (
          <ContextMenuItem onSelect={onNewFolder}>
            <FolderPlus aria-hidden />
            {t('ops.newFolder')}
          </ContextMenuItem>
        )}
        {favorite !== null && (
          <ContextMenuItem onSelect={onToggleFavorite}>
            {favorite ? <StarOff aria-hidden /> : <Star aria-hidden />}
            {favorite ? t('menu.removeFavorite') : t('menu.addFavorite')}
          </ContextMenuItem>
        )}
        <PluginsSubmenu plugins={plugins} onSelect={onPluginCommand} />
        {(canCreate || plugins.length > 0 || favorite !== null) && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={onSelectAll}>
          <CheckCheck aria-hidden />
          {t('menu.selectAll')}
          <ContextMenuShortcut>Ctrl A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRefresh}>
          <RefreshCw aria-hidden />
          {t('menu.refresh')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
