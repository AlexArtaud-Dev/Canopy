'use client';

import {
  CheckCheck,
  CopyPlus,
  FileArchive,
  FileCheck,
  PackageOpen,
  Download,
  FolderInput,
  Eye,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Info,
  Link2,
  Share2,
  Star,
  StarOff,
  PencilLine,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommandEntry } from '@canopy/contracts';
import type { ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';

import {
  archiveFormats,
  checksumAlgorithms,
  isArchive,
  type ArchiveFormat,
  type ChecksumAlgorithm,
} from '../operations.utils';
import { canPreview } from '../preview.utils';
import type { PluginMenu } from '@/features/commands';

import type { BrowserEntry } from '../server/browse';
import { PluginsSubmenu } from './plugins-submenu';

/** Translation keys of the archive formats (a dot cannot be part of a key). */
const formatKeys = { zip: 'zip', 'tar.gz': 'tarGz', '7z': 'sevenZ' } as const satisfies Record<
  ArchiveFormat,
  string
>;

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
  /** Archives the entry (or its selection) next to it, as a job. */
  onCompress: (entry: BrowserEntry, format: ArchiveFormat) => void;
  /** Unpacks an archive into a new folder next to it, as a job. */
  onExtract: (entry: BrowserEntry) => void;
  /** Hashes a file, as a job; the digest shows in the operations panel. */
  onChecksum: (entry: BrowserEntry, algorithm: ChecksumAlgorithm) => void;
  /** Creates a share link to the entry. */
  onShare: (entry: BrowserEntry) => void;
  /** Plugin commands that work on a folder (empty when none is installed or allowed). */
  plugins: readonly PluginMenu[];
  /** Opens a plugin command in a dialog, with this folder filled in. */
  onPluginCommand: (folderPath: string, command: CommandEntry) => void;
  /** Pins or unpins a folder in the person's favorites. */
  onToggleFavorite: (entry: BrowserEntry) => void;
  isFavorite: (path: string) => boolean;
  /** Opens the Properties dialog of the entry. */
  onProperties: (entry: BrowserEntry) => void;
  /** Search results only: go to the folder that holds the entry. */
  onShowInFolder?: ((entry: BrowserEntry) => void) | undefined;
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
        {(entry.isDirectory || canPreview(entry)) && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onOpen(entry);
            }}
          >
            {entry.isDirectory ? <FolderOpen aria-hidden /> : <Eye aria-hidden />}
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
        {entry.isDirectory && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onToggleFavorite(entry);
            }}
          >
            {handlers.isFavorite(entry.path) ? <StarOff aria-hidden /> : <Star aria-hidden />}
            {handlers.isFavorite(entry.path) ? t('removeFavorite') : t('addFavorite')}
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
        {entry.actions.includes('copy') && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FileArchive aria-hidden />
              {t('compress')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {archiveFormats.map((format) => (
                <ContextMenuItem
                  key={format}
                  onSelect={() => {
                    handlers.onCompress(entry, format);
                  }}
                >
                  {/* i18n-dynamic: files.browser.menu.formats */}
                  {t(`formats.${formatKeys[format]}`)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {!entry.isDirectory && isArchive(entry.name) && entry.actions.includes('copy') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onExtract(entry);
            }}
          >
            <PackageOpen aria-hidden />
            {t('extract')}
          </ContextMenuItem>
        )}
        {!entry.isDirectory && entry.actions.includes('download') && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FileCheck aria-hidden />
              {t('checksum')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {checksumAlgorithms.map((algorithm) => (
                <ContextMenuItem
                  key={algorithm}
                  onSelect={() => {
                    handlers.onChecksum(entry, algorithm);
                  }}
                >
                  {/* i18n-dynamic: files.browser.menu.algorithms */}
                  {t(`algorithms.${algorithm}`)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
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
        {entry.actions.includes('share') && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onShare(entry);
            }}
          >
            <Share2 aria-hidden />
            {t('share')}
          </ContextMenuItem>
        )}
        {entry.isDirectory && entry.actions.includes('update') && (
          <PluginsSubmenu
            plugins={handlers.plugins}
            onSelect={(command) => {
              handlers.onPluginCommand(entry.path, command);
            }}
          />
        )}
        {handlers.onShowInFolder && (
          <ContextMenuItem
            onSelect={() => {
              handlers.onShowInFolder?.(entry);
            }}
          >
            <FolderSearch aria-hidden />
            {t('showInFolder')}
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
        <ContextMenuItem
          onSelect={() => {
            handlers.onProperties(entry);
          }}
        >
          <Info aria-hidden />
          {t('properties')}
          <ContextMenuShortcut>Alt ↵</ContextMenuShortcut>
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
