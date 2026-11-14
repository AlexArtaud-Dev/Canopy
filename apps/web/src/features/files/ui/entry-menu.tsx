'use client';

import { Slot } from 'radix-ui';
import type { CommandEntry } from '@canopy/contracts';
import { useRef, useState, type ReactNode } from 'react';

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
import { useIsMobile } from '@/shared/ui/use-mobile';
import type { PluginMenu } from '@/features/commands';

import type { ArchiveFormat, ChecksumAlgorithm } from '../operations.utils';
import type { BrowserEntry } from '../server/browse';
import { ActionSheet } from './action-sheet';
import { useEntryActions, type MenuNode } from './entry-actions';

/** A press this long on a touch screen opens the actions. */
const longPressMs = 500;
/** A finger moving further is scrolling, not pressing. */
const pressSlop = 10;

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
  /** Plugin commands that work on the entry (empty when none is installed or allowed). */
  pluginsFor: (entry: BrowserEntry) => readonly PluginMenu[];
  /** Opens a plugin command in a dialog, with this entry filled in. */
  onPluginCommand: (path: string, command: CommandEntry) => void;
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

/**
 * An entry's actions: a right-click menu on a desktop; on a phone a sheet rising from the
 * bottom, opened by a long press or the item's menu button (both the same list).
 */
export function EntryMenu({ entry, children, ...handlers }: EntryMenuProps) {
  const isMobile = useIsMobile();
  const nodes = useEntryActions(entry, handlers);
  if (isMobile) {
    return (
      <SheetMenu
        title={entry.name}
        nodes={nodes}
        onOpen={() => {
          handlers.onMenuOpen(entry);
        }}
      >
        {children}
      </SheetMenu>
    );
  }
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) handlers.onMenuOpen(entry);
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">{nodes.map(contextNode)}</ContextMenuContent>
    </ContextMenu>
  );
}

function contextNode(node: MenuNode): ReactNode {
  if (node.kind === 'separator') return <ContextMenuSeparator key={node.key} />;
  const Icon = node.icon;
  if (node.kind === 'group') {
    return (
      <ContextMenuSub key={node.key}>
        <ContextMenuSubTrigger>
          {Icon && <Icon aria-hidden />}
          {node.label}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-56">
          {node.items.map(contextNode)}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }
  return (
    <ContextMenuItem
      key={node.key}
      variant={node.destructive ? 'destructive' : 'default'}
      onSelect={node.onSelect}
    >
      {Icon && <Icon aria-hidden />}
      {node.label}
      {node.shortcut && <ContextMenuShortcut>{node.shortcut}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
}

interface SheetMenuProps {
  title: string;
  nodes: readonly MenuNode[];
  onOpen: () => void;
  children: ReactNode;
}

/**
 * Opens the action sheet on a long press or a `contextmenu` event (the item's menu button sends
 * one); the tap ending a long press does not also open the item.
 */
function SheetMenu({ title, nodes, onOpen, children }: SheetMenuProps) {
  const [open, setOpen] = useState(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const show = () => {
    onOpen();
    setOpen(true);
  };
  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  return (
    <>
      <Slot.Root
        data-slot="context-menu-trigger"
        onContextMenu={(event) => {
          event.preventDefault();
          cancel();
          show();
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return;
          cancel();
          const timer = window.setTimeout(() => {
            press.current = null;
            swallowClick.current = true;
            show();
          }, longPressMs);
          press.current = { timer, x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > pressSlop) {
            cancel();
          }
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </Slot.Root>
      <ActionSheet open={open} onOpenChange={setOpen} title={title} nodes={nodes} />
    </>
  );
}
