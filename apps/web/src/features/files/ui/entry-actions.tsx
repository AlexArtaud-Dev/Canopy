'use client';

import {
  CheckCheck,
  CopyPlus,
  Download,
  Eye,
  FileArchive,
  FileCheck,
  FolderInput,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Info,
  Link2,
  PackageOpen,
  PencilLine,
  Puzzle,
  RefreshCw,
  Share2,
  Star,
  StarOff,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { localized } from '@/features/commands';

import {
  archiveFormats,
  checksumAlgorithms,
  isArchive,
  type ArchiveFormat,
} from '../operations.utils';
import { canPreview } from '../preview.utils';
import type { BrowserEntry } from '../server/browse';
import type { EntryMenuHandlers } from './entry-menu';

/** Translation keys of the archive formats (a dot cannot be part of a key). */
const formatKeys = { zip: 'zip', 'tar.gz': 'tarGz', '7z': 'sevenZ' } as const satisfies Record<
  ArchiveFormat,
  string
>;

/** One line of an entry's menu: an action, a group of actions, or a separation. */
export type MenuNode =
  | {
      kind: 'item';
      key: string;
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      destructive?: boolean;
      onSelect: () => void;
    }
  | { kind: 'group'; key: string; label: string; icon?: LucideIcon; items: MenuNode[] }
  | { kind: 'separator'; key: string };

/**
 * What an entry offers, once: the right-click menu (desktop) and the action sheet (phone) both
 * show this list, so that they never differ.
 */
export function useEntryActions(entry: BrowserEntry, handlers: EntryMenuHandlers): MenuNode[] {
  const t = useTranslations('files.browser.menu');
  const locale = useLocale();
  const can = (action: string) => entry.actions.includes(action as never);
  const nodes: MenuNode[] = [];
  const item = (
    key: string,
    label: string,
    icon: LucideIcon,
    onSelect: () => void,
    extra: { shortcut?: string; destructive?: boolean } = {},
  ) => {
    nodes.push({ kind: 'item', key, label, icon, onSelect, ...extra });
  };

  if (entry.isDirectory || canPreview(entry)) {
    item(
      'open',
      t('open'),
      entry.isDirectory ? FolderOpen : Eye,
      () => {
        handlers.onOpen(entry);
      },
      { shortcut: '↵' },
    );
  }
  if (entry.isDirectory) {
    item('size', t('folderSize'), HardDrive, () => {
      handlers.onFolderSize(entry);
    });
    const favorite = handlers.isFavorite(entry.path);
    item(
      'favorite',
      favorite ? t('removeFavorite') : t('addFavorite'),
      favorite ? StarOff : Star,
      () => {
        handlers.onToggleFavorite(entry);
      },
    );
  }
  if (can('download')) {
    item('download', entry.isDirectory ? t('downloadZip') : t('download'), Download, () => {
      handlers.onDownload(entry);
    });
  }
  if (can('copy')) {
    nodes.push({
      kind: 'group',
      key: 'compress',
      label: t('compress'),
      icon: FileArchive,
      items: archiveFormats.map((format) => ({
        kind: 'item',
        key: format,
        // i18n-dynamic: files.browser.menu.formats
        label: t(`formats.${formatKeys[format]}`),
        onSelect: () => {
          handlers.onCompress(entry, format);
        },
      })),
    });
  }
  if (!entry.isDirectory && isArchive(entry.name) && can('copy')) {
    item('extract', t('extract'), PackageOpen, () => {
      handlers.onExtract(entry);
    });
  }
  if (!entry.isDirectory && can('download')) {
    nodes.push({
      kind: 'group',
      key: 'checksum',
      label: t('checksum'),
      icon: FileCheck,
      items: checksumAlgorithms.map((algorithm) => ({
        kind: 'item',
        key: algorithm,
        // i18n-dynamic: files.browser.menu.algorithms
        label: t(`algorithms.${algorithm}`),
        onSelect: () => {
          handlers.onChecksum(entry, algorithm);
        },
      })),
    });
  }
  if (can('update')) {
    item(
      'rename',
      t('rename'),
      PencilLine,
      () => {
        handlers.onRename(entry);
      },
      { shortcut: 'F2' },
    );
  }
  if (can('copy')) {
    item('copy', t('copyTo'), CopyPlus, () => {
      handlers.onTransfer('copy', entry);
    });
  }
  if (can('move')) {
    item('move', t('moveTo'), FolderInput, () => {
      handlers.onTransfer('move', entry);
    });
  }
  if (can('share')) {
    item('share', t('share'), Share2, () => {
      handlers.onShare(entry);
    });
  }
  const plugins = handlers.pluginsFor(entry);
  if (plugins.length > 0) {
    nodes.push({
      kind: 'group',
      key: 'plugins',
      label: t('plugins'),
      icon: Puzzle,
      items: plugins.map(({ plugin, entries }) => ({
        kind: 'group',
        key: plugin.id,
        label: localized(plugin.name, locale),
        items: entries.map((command) => ({
          kind: 'item',
          key: command.id,
          label: localized(command.name, locale),
          onSelect: () => {
            handlers.onPluginCommand(entry.path, command);
          },
        })),
      })),
    });
  }
  const showInFolder = handlers.onShowInFolder;
  if (showInFolder) {
    item('show', t('showInFolder'), FolderSearch, () => {
      showInFolder(entry);
    });
  }
  item('path', t('copyPath'), Link2, () => {
    handlers.onCopyPath(entry);
  });
  item(
    'properties',
    t('properties'),
    Info,
    () => {
      handlers.onProperties(entry);
    },
    { shortcut: 'Alt ↵' },
  );
  if (can('delete')) {
    nodes.push({ kind: 'separator', key: 'before-delete' });
    item(
      'delete',
      t('delete'),
      Trash2,
      () => {
        handlers.onDelete(entry, false);
      },
      { shortcut: 'Del', destructive: true },
    );
    item(
      'delete-forever',
      t('deletePermanently'),
      Trash2,
      () => {
        handlers.onDelete(entry, true);
      },
      { shortcut: 'Shift Del', destructive: true },
    );
  }
  nodes.push({ kind: 'separator', key: 'before-selection' });
  item('select-all', t('selectAll'), CheckCheck, handlers.onSelectAll, { shortcut: 'Ctrl A' });
  item('refresh', t('refresh'), RefreshCw, handlers.onRefresh);
  return nodes;
}
