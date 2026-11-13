'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import {
  CopyPlus,
  Download,
  FolderInput,
  FolderOpen,
  FolderTree,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import type { CommandEntry } from '@canopy/contracts';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { cn } from 'cn';
import { ErrorState } from '@/shared/errors/error-state';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import type { ActionResult } from '@/shared/lib/action';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Spinner } from '@/shared/ui/spinner';
import {
  castCommands,
  CommandDialog,
  pluginMenus,
  targetParam,
  usePluginCommands,
} from '@/features/commands';
import { startFolderSize } from '@/features/jobs';
import { ShareDialog } from '@/features/shares';
import { DeleteDialogs, useDeleteFlow } from '@/features/trash';
import { filesFromDrop, filesFromInput, useUploadFlow } from '@/features/uploads';

import {
  browserHref,
  emptySelection,
  gridColumns,
  isSearch,
  moveFocus,
  nextSort,
  parentPath,
  reduceSelection,
  sortResults,
  type BrowserQuery,
  type SelectionAction,
  type SortKey,
} from './browser.utils';
import { useBrowserView, useElementWidth } from './model/use-browser-view';
import { useFileOperations } from './model/use-file-operations';
import {
  canDropInto,
  dropOperation,
  operationTargets,
  pointerBadgeOffset,
  stemLength,
  type ArchiveFormat,
  type ChecksumAlgorithm,
  type TransferOperation,
} from './operations.utils';
import { startChecksum, startCompress, startExtract } from './server/operations';
import { useFolder } from './model/use-folder';
import { useSearch } from './model/use-search';
import { useStreamTicket } from './model/use-stream-ticket';
import { canPreview } from './preview.utils';
import type { BrowserEntry, FolderPage } from './server/browse';
import { BrowserToolbar } from './ui/browser-toolbar';
import { ConflictDialog } from './ui/conflict-dialog';
import type { DropData } from './ui/dnd';
import { FolderMenu } from './ui/folder-menu';
import { FolderPickerDialog } from './ui/folder-picker-dialog';
import { GridView, tileGap, tileMinWidth } from './ui/grid-view';
import { useFavorites } from './model/use-favorites';
import { PropertiesDialog } from './ui/properties/properties-dialog';
import { PreviewDialog } from './ui/preview/preview-dialog';
import { ListHeader, ListView } from './ui/list-view';
import { NameDialog } from './ui/name-dialog';
import { ShortcutsDialog } from './ui/shortcuts-dialog';
import type { ClickModifiers } from './ui/view-props';

/** Keeps the drag badge beside the pointer instead of at the dragged row's corner. */
const followPointer: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  const offset = pointerBadgeOffset(
    activatorEvent instanceof MouseEvent ? activatorEvent : null,
    activeNodeRect,
  );
  return { ...transform, x: transform.x + offset.x, y: transform.y + offset.y };
};

/** Start fetching the next page this many entries before the end of what is loaded. */
const prefetchMargin = 100;
const gridPadding = 32;

interface FileBrowserProps {
  query: BrowserQuery;
  firstPage: FolderPage;
}

/** The Files page: one folder, list or grid, with selection, keyboard and context menu. */
export function FileBrowserContainer({ query, firstPage }: FileBrowserProps) {
  const t = useTranslations('files.browser');
  const jobsT = useTranslations('jobs.dock');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const folder = useFolder(query, firstPage);
  const searching = isSearch(query.q);
  const search = useSearch(query.path, query.q, searching);
  const results = useMemo(
    () => sortResults(search.entries, query.sort, query.order),
    [search.entries, query.sort, query.order],
  );
  // While searching, results stand in for the folder's entries; everything else works the same.
  const entries = searching ? results : folder.entries;
  const hasMore = !searching && folder.hasMore;
  const loadingMore = !searching && folder.loadingMore;
  const { loadMore } = folder;
  const listing = searching
    ? { error: search.error, refresh: search.refresh, refreshing: search.searching }
    : folder;
  const keys = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const [rawSelection, setSelection] = useState(emptySelection);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [view, setView] = useBrowserView();
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [propertiesPath, setPropertiesPath] = useState<string | null>(null);
  const favorites = useFavorites();
  const [shareTarget, setShareTarget] = useState<BrowserEntry | null>(null);
  const [command, setCommand] = useState<{ entry: CommandEntry; target: string } | null>(null);
  const pluginCommands = usePluginCommands();
  const folderPlugins = useMemo(
    () => pluginMenus(pluginCommands, { kind: 'folder' }),
    [pluginCommands],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const ops = useFileOperations(query.path);
  const deletion = useDeleteFlow();
  const [dragCount, setDragCount] = useState(0);
  // Copy-or-move is decided when the drop happens, as in desktop file managers.
  const dropModifiers = useRef({ ctrlKey: false, altKey: false, metaKey: false });
  useEffect(() => {
    const track = (event: globalThis.KeyboardEvent) => {
      dropModifiers.current = {
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
    };
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
    };
  }, []);
  // A drag starts after 6 px so clicks and double-clicks stay clicks. Mouse only: on touch screens
  // the same moves are in the item menu ("Move to"), and dragging would fight scrolling.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  // Thumbnails are stream requests: the grid keeps a ticket while it shows any.
  const thumbnailTicket = useStreamTicket(
    view === 'grid' && entries.some((entry) => entry.thumbnail),
  );
  const columns = view === 'grid' ? gridColumns(width - gridPadding, tileMinWidth, tileGap) : 1;

  const dispatch = useCallback(
    (action: SelectionAction) => {
      setSelection((state) => reduceSelection(state, action, keys));
    },
    [keys],
  );
  // Entries that disappeared on a reload drop out of the selection.
  const selection = useMemo(
    () => reduceSelection(rawSelection, { type: 'retain' }, keys),
    [rawSelection, keys],
  );

  const hrefFor = useCallback((path: string) => browserHref({ ...query, path, q: '' }), [query]);
  const navigate = (next: BrowserQuery) => {
    router.push(browserHref(next) as Route);
  };
  const open = (entry: BrowserEntry | undefined) => {
    if (entry?.isDirectory) navigate({ ...query, path: entry.path, q: '' });
    else if (entry && canPreview(entry)) setPreviewPath(entry.path);
  };
  const showPreview = (path: string) => {
    setPreviewPath(path);
    setFocusIndex(entries.findIndex((entry) => entry.path === path));
  };
  const goUp = () => {
    const parent = parentPath(query.path);
    if (parent !== null) navigate({ ...query, path: parent, q: '' });
  };

  const onRendered = useCallback(
    (lastIndex: number) => {
      if (hasMore && !loadingMore && lastIndex >= entries.length - prefetchMargin) void loadMore();
    },
    [entries.length, hasMore, loadingMore, loadMore],
  );

  const onClick = (index: number, modifiers: ClickModifiers) => {
    const entry = entries[index];
    if (!entry) return;
    setFocusIndex(index);
    if (modifiers.touch && selection.selected.size === 0) {
      open(entry);
      if (!entry.isDirectory) dispatch({ type: 'only', key: entry.path });
      return;
    }
    if (modifiers.range) dispatch({ type: 'range', key: entry.path });
    else if (modifiers.toggle || modifiers.touch) dispatch({ type: 'toggle', key: entry.path });
    else dispatch({ type: 'only', key: entry.path });
  };

  const onToggle = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    setFocusIndex(index);
    dispatch({ type: 'toggle', key: entry.path });
  };

  const idOf = (index: number) => `entry-${index}`;

  const entryByPath = useMemo(
    () => new Map(entries.map((entry) => [entry.path, entry])),
    [entries],
  );
  /** Every target allows the operation (the engine checks again; this only hides dead ends). */
  const allowed = (
    operation: TransferOperation | 'download' | 'delete',
    paths: readonly string[],
  ) =>
    paths.length > 0 &&
    paths.every((path) => entryByPath.get(path)?.actions.includes(operation) === true);
  const selectedPaths = [...selection.selected];

  // Uploads: names already here (and whether they are folders) feed the conflict check.
  const existingNames = useMemo(
    () => new Map(entries.map((entry) => [entry.name, entry.isDirectory])),
    [entries],
  );
  const uploads = useUploadFlow(query.path, existingNames);
  const canUpload = folder.actions.includes('upload');
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragsFiles = (event: React.DragEvent) =>
    canUpload && Array.from(event.dataTransfer.types).includes('Files');

  const openMenuAtFocus = () => {
    const element = document.getElementById(idOf(focusIndex));
    if (!element) return;
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: box.left + Math.min(box.width / 2, 120),
        clientY: box.top + box.height / 2,
      }),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = entries[focusIndex];
    const moved = moveFocus(Math.max(focusIndex, 0), event.key, entries.length, columns);
    if (moved !== null) {
      event.preventDefault();
      const target = focusIndex < 0 && !event.key.startsWith('Page') ? 0 : moved;
      setFocusIndex(target);
      const key = keys[target];
      if (event.shiftKey && key) dispatch({ type: 'range', key });
      else if (!event.ctrlKey && !event.metaKey && key) dispatch({ type: 'only', key });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      dispatch({ type: 'all' });
    } else if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      if (focused) setPropertiesPath(focused.path);
    } else if (event.key === 'Enter') {
      open(focused);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      goUp();
    } else if (event.key === ' ' && focused) {
      event.preventDefault();
      dispatch({ type: 'toggle', key: focused.path });
    } else if (event.key === 'Escape') {
      dispatch({ type: 'clear' });
    } else if (event.key === 'Delete' && allowed('delete', selectedPaths)) {
      event.preventDefault();
      void deletion.start(selectedPaths, event.shiftKey);
    } else if (event.key === 'F2' && focused?.actions.includes('update')) {
      event.preventDefault();
      ops.openRename(focused);
    } else if ((event.ctrlKey || event.metaKey) && ['c', 'x'].includes(event.key.toLowerCase())) {
      const operation = event.key.toLowerCase() === 'c' ? 'copy' : 'move';
      if (allowed(operation, selectedPaths)) ops.copyToClipboard(operation, selectedPaths);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (folder.actions.includes('create')) void ops.paste();
    } else if (event.key === '?') {
      setHelpOpen(true);
    } else if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault();
      openMenuAtFocus();
    }
  };

  /** A job started from the menu: its progress and result are in the operations panel. */
  const announceJob = (started: Promise<ActionResult<unknown>>, name: string) => {
    void started.then((result) => {
      if (result.ok) toast(jobsT('started', { name }));
      else toast.error(errorMessage(result.error.code, result.error.params));
    });
  };

  const menu = {
    onOpen: open,
    onShare: setShareTarget,
    onToggleFavorite: (entry: BrowserEntry) => {
      void favorites.toggle(entry.path);
    },
    isFavorite: favorites.isFavorite,
    onProperties: (entry: BrowserEntry) => {
      setPropertiesPath(entry.path);
    },
    onShowInFolder: searching
      ? (entry: BrowserEntry) => {
          navigate({ ...query, path: parentPath(entry.path) ?? '/', q: '' });
        }
      : undefined,
    onCopyPath: (entry: BrowserEntry) => {
      void navigator.clipboard.writeText(entry.path).then(() => toast.success(t('pathCopied')));
    },
    onFolderSize: (entry: BrowserEntry) => {
      announceJob(startFolderSize({ path: entry.path }), entry.name);
    },
    onCompress: (entry: BrowserEntry, format: ArchiveFormat) => {
      const targets = operationTargets(selection.selected, entry.path);
      if (allowed('copy', targets))
        announceJob(startCompress({ sources: targets, format }), entry.name);
    },
    onExtract: (entry: BrowserEntry) => {
      announceJob(startExtract({ path: entry.path }), entry.name);
    },
    onChecksum: (entry: BrowserEntry, algorithm: ChecksumAlgorithm) => {
      announceJob(startChecksum({ path: entry.path, algorithm }), entry.name);
    },
    onRename: ops.openRename,
    onDelete: (entry: BrowserEntry, permanent: boolean) => {
      const targets = operationTargets(selection.selected, entry.path);
      if (allowed('delete', targets)) void deletion.start(targets, permanent);
    },
    onDownload: (entry: BrowserEntry) => {
      const targets = operationTargets(selection.selected, entry.path);
      if (!allowed('download', targets)) return;
      void ops.download(targets.flatMap((path) => entryByPath.get(path) ?? []));
    },
    onTransfer: (operation: TransferOperation, entry: BrowserEntry) => {
      const targets = operationTargets(selection.selected, entry.path);
      if (allowed(operation, targets)) ops.openPicker(operation, targets);
    },
    onSelectAll: () => {
      dispatch({ type: 'all' });
    },
    onRefresh: () => {
      void listing.refresh();
    },
    pluginsFor: (entry: BrowserEntry) => {
      if (!entry.isDirectory)
        return pluginMenus(pluginCommands, { kind: 'file', name: entry.name });
      // A folder command changes what is inside: offered only where the person may.
      return entry.actions.includes('update') ? folderPlugins : [];
    },
    onPluginCommand: (target: string, entry: CommandEntry) => {
      setCommand({ entry, target });
    },
    onMenuOpen: (entry: BrowserEntry) => {
      setFocusIndex(keys.indexOf(entry.path));
      if (!selection.selected.has(entry.path)) dispatch({ type: 'only', key: entry.path });
    },
  };

  const viewProps = {
    entries,
    selected: selection.selected,
    focusIndex,
    scrollRef,
    onRendered,
    onClick,
    onOpen: (index: number) => {
      open(entries[index]);
    },
    onToggle,
    menu,
    idOf,
    canDrag: (entry: BrowserEntry) =>
      entry.actions.includes('move') || entry.actions.includes('copy'),
    showLocation: searching,
  };

  const onDragStart = (event: DragStartEvent) => {
    const path = String(event.active.id);
    if (!selection.selected.has(path)) dispatch({ type: 'only', key: path });
    setDragCount(operationTargets(selection.selected, path).length);
  };
  const onDragEnd = (event: DragEndEvent) => {
    setDragCount(0);
    const target = event.over?.data.current as DropData | undefined;
    if (!target) return;
    const sources = operationTargets(selection.selected, String(event.active.id));
    const operation = dropOperation(dropModifiers.current);
    if (!allowed(operation, sources) || !canDropInto(sources, target.path, operation)) return;
    void ops.transfer(operation, sources, target.path);
  };

  const onSort = (key: SortKey) => {
    navigate({ ...query, ...nextSort(query, key) });
  };

  const dialog = ops.dialog;
  return (
    <DndContext
      sensors={sensors}
      // The folder under the pointer receives the drop, whatever the badge overlaps.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragCount(0);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <BrowserToolbar
          canUpload={canUpload}
          onUploadFiles={() => filesInput.current?.click()}
          onUploadFolder={() => folderInput.current?.click()}
          canCreate={folder.actions.includes('create')}
          onNewFolder={ops.openNewFolder}
          path={query.path}
          favorite={query.path === '/' ? null : favorites.isFavorite(query.path)}
          onToggleFavorite={() => {
            void favorites.toggle(query.path);
          }}
          hrefFor={hrefFor}
          view={view}
          onViewChange={setView}
          sort={query.sort}
          order={query.order}
          onSort={(key) => {
            navigate({ ...query, sort: key, order: 'asc' });
          }}
          onOrder={(order) => {
            navigate({ ...query, order });
          }}
          refreshing={listing.refreshing}
          onRefresh={() => {
            void listing.refresh();
          }}
          search={query.q}
          onSearch={(q) => {
            router.replace(browserHref({ ...query, q }) as Route);
          }}
          onShowShortcuts={() => {
            setHelpOpen(true);
          }}
        />
        {view === 'list' && entries.length > 0 && (
          <ListHeader sort={query.sort} order={query.order} onSort={onSort} />
        )}
        <FolderMenu
          plugins={folder.actions.includes('update') && !searching ? folderPlugins : []}
          canCreate={folder.actions.includes('create') && !searching}
          onPluginCommand={(entry) => {
            setCommand({ entry, target: query.path });
          }}
          onNewFolder={ops.openNewFolder}
          onSelectAll={menu.onSelectAll}
          onRefresh={menu.onRefresh}
          favorite={query.path === '/' || searching ? null : favorites.isFavorite(query.path)}
          onToggleFavorite={() => {
            void favorites.toggle(query.path);
          }}
        >
          <div
            ref={scrollRef}
            role="listbox"
            aria-label={t('entriesLabel', { path: query.path })}
            aria-multiselectable
            aria-activedescendant={
              focusIndex >= 0 && entries[focusIndex] ? idOf(focusIndex) : undefined
            }
            tabIndex={0}
            onKeyDown={onKeyDown}
            // Files dragged from the desktop (native drag and drop, apart from dnd-kit's moves).
            onDragOver={(event) => {
              if (!dragsFiles(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDropActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDropActive(false);
            }}
            onDrop={(event) => {
              if (!dragsFiles(event)) return;
              event.preventDefault();
              setDropActive(false);
              void filesFromDrop(event.dataTransfer).then(uploads.start);
            }}
            className={cn(
              'min-h-0 flex-1 overflow-y-auto outline-none',
              view === 'grid' && 'p-4',
              // Files dragged from the desktop: the whole folder is the drop target.
              dropActive && 'bg-primary/5 ring-primary ring-2 ring-inset',
            )}
          >
            {listing.error && entries.length === 0 ? (
              <ErrorState
                code={listing.error.code}
                params={listing.error.params}
                reference={listing.error.requestId}
                onRetry={() => {
                  void listing.refresh();
                }}
              />
            ) : searching && entries.length === 0 ? (
              search.searching ? (
                <p className="text-muted-foreground flex items-center justify-center gap-2 p-6 text-sm">
                  <Spinner />
                  {t('search.searching')}
                </p>
              ) : (
                <NoResults />
              )
            ) : entries.length === 0 ? (
              <EmptyFolder isRoot={query.path === '/'} />
            ) : view === 'grid' ? (
              <GridView {...viewProps} columns={columns} thumbnails={thumbnailTicket === 'ready'} />
            ) : (
              <ListView {...viewProps} />
            )}
            {loadingMore && (
              <p className="text-muted-foreground flex items-center justify-center gap-2 p-3 text-sm">
                <Spinner />
                {t('loadingMore')}
              </p>
            )}
          </div>
        </FolderMenu>
        <footer className="text-muted-foreground flex min-h-10 flex-wrap items-center gap-x-3 border-t px-4 text-xs md:px-6">
          <span aria-live="polite">
            {searching
              ? t('search.count', { count: entries.length })
              : t('count', { count: folder.total })}
          </span>
          {searching && search.truncated && (
            // i18n-dynamic: files.browser.search.truncated
            <span>{t(`search.truncated.${search.truncated}`)}</span>
          )}
          {selection.selected.size > 0 && (
            <span className="flex items-center gap-1">
              {t('selected', { count: selection.selected.size })}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('clearSelection')}
                onClick={() => {
                  dispatch({ type: 'clear' });
                }}
              >
                <X aria-hidden />
              </Button>
            </span>
          )}
          {selection.selected.size > 0 && (
            <span className="ml-auto flex items-center gap-1">
              {allowed('delete', selectedPaths) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    void deletion.start(selectedPaths, false);
                  }}
                >
                  <Trash2 aria-hidden data-icon="inline-start" />
                  <span className="max-sm:sr-only">{t('menu.delete')}</span>
                </Button>
              )}
              {allowed('download', selectedPaths) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    void ops.download(selectedPaths.flatMap((path) => entryByPath.get(path) ?? []));
                  }}
                >
                  <Download aria-hidden data-icon="inline-start" />
                  <span className="max-sm:sr-only">{t('menu.download')}</span>
                </Button>
              )}
              {allowed('copy', selectedPaths) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    ops.openPicker('copy', selectedPaths);
                  }}
                >
                  <CopyPlus aria-hidden data-icon="inline-start" />
                  <span className="max-sm:sr-only">{t('menu.copyTo')}</span>
                </Button>
              )}
              {allowed('move', selectedPaths) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    ops.openPicker('move', selectedPaths);
                  }}
                >
                  <FolderInput aria-hidden data-icon="inline-start" />
                  <span className="max-sm:sr-only">{t('menu.moveTo')}</span>
                </Button>
              )}
            </span>
          )}
        </footer>
        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <PropertiesDialog
          path={propertiesPath}
          onClose={() => {
            setPropertiesPath(null);
          }}
        />
        <PreviewDialog
          entries={entries}
          path={previewPath}
          onNavigate={showPreview}
          onClose={() => {
            setPreviewPath(null);
          }}
          onDownload={(entry) => void ops.download([entry])}
          castWith={(entry) => castCommands(pluginCommands, entry.name)}
          onCast={(entry, castCommand) => {
            // The screen plays it now: the viewer closes rather than play it twice.
            setPreviewPath(null);
            setCommand({ entry: castCommand, target: entry.path });
          }}
        />
        <CommandDialog
          entry={command?.entry ?? null}
          preset={command ? { [targetParam(command.entry) ?? '']: command.target } : {}}
          onClose={() => {
            setCommand(null);
          }}
        />
        <ShareDialog
          target={shareTarget}
          onClose={() => {
            setShareTarget(null);
          }}
        />
        <DeleteDialogs
          dialog={deletion.dialog}
          pending={deletion.pending}
          onConfirm={() => void deletion.confirm()}
          onClose={deletion.close}
        />
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            uploads.start(filesFromInput(event.currentTarget.files));
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          // Non-standard but supported by every current browser: picks a whole folder.
          {...{ webkitdirectory: '' }}
          onChange={(event) => {
            uploads.start(filesFromInput(event.currentTarget.files));
            event.currentTarget.value = '';
          }}
        />
        {uploads.conflicts.length > 0 && (
          <ConflictDialog
            open
            onOpenChange={uploads.cancel}
            operation="copy"
            conflicts={uploads.conflicts}
            truncated={false}
            confirmLabel={t('ops.upload')}
            onConfirm={uploads.confirm}
          />
        )}
        {dialog.kind === 'newFolder' && (
          <NameDialog
            open
            onOpenChange={ops.close}
            title={t('ops.newFolderTitle')}
            description={t('ops.newFolderDescription')}
            submitLabel={t('ops.create')}
            initialName={t('ops.defaultFolderName')}
            selectionEnd={t('ops.defaultFolderName').length}
            onSubmit={ops.submitNewFolder}
          />
        )}
        {dialog.kind === 'rename' && (
          <NameDialog
            open
            onOpenChange={ops.close}
            title={t('ops.renameTitle')}
            description={t('ops.renameDescription', { name: dialog.entry.name })}
            submitLabel={t('ops.rename')}
            initialName={dialog.entry.name}
            selectionEnd={stemLength(dialog.entry.name, dialog.entry.isDirectory)}
            onSubmit={(name) => ops.submitRename(dialog.entry, name)}
          />
        )}
        {dialog.kind === 'pick' && (
          <FolderPickerDialog
            open
            onOpenChange={ops.close}
            operation={dialog.operation}
            sources={dialog.sources}
            startPath={query.path}
            loadFolders={ops.loadFolders}
            onConfirm={(destination) => {
              void ops.transfer(dialog.operation, dialog.sources, destination);
            }}
          />
        )}
        {dialog.kind === 'conflicts' && (
          <ConflictDialog
            open
            onOpenChange={ops.close}
            operation={dialog.operation}
            conflicts={dialog.conflicts}
            truncated={dialog.truncated}
            onConfirm={(choice) => {
              void ops.confirmConflicts(choice);
            }}
          />
        )}
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <DragOverlay dropAnimation={null} modifiers={[followPointer]}>
            {dragCount > 0 && (
              <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium shadow-lg">
                {t('ops.dragging', { count: dragCount })}
              </span>
            )}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}

function NoResults() {
  const t = useTranslations('files.browser.search');
  return (
    <Empty className="m-4 border border-dashed md:m-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t('none.title')}</EmptyTitle>
        <EmptyDescription>{t('none.description')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function EmptyFolder({ isRoot }: { isRoot: boolean }) {
  const t = useTranslations('files.browser');
  return (
    <Empty className="m-4 border border-dashed md:m-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isRoot ? <FolderTree aria-hidden /> : <FolderOpen aria-hidden />}
        </EmptyMedia>
        <EmptyTitle>{isRoot ? t('noVolumes.title') : t('emptyFolder.title')}</EmptyTitle>
        <EmptyDescription>
          {isRoot ? t('noVolumes.description') : t('emptyFolder.description')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
