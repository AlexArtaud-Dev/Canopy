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
import { CopyPlus, Download, FolderInput, FolderOpen, FolderTree, Trash2, X } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { cn } from 'cn';
import { ErrorState } from '@/shared/errors/error-state';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Spinner } from '@/shared/ui/spinner';
import { startFolderSize } from '@/features/jobs';
import { DeleteDialogs, useDeleteFlow } from '@/features/trash';
import { filesFromDrop, filesFromInput, useUploadFlow } from '@/features/uploads';

import {
  browserHref,
  emptySelection,
  gridColumns,
  moveFocus,
  nextSort,
  parentPath,
  reduceSelection,
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
  type TransferOperation,
} from './operations.utils';
import { useFolder } from './model/use-folder';
import { useStreamTicket } from './model/use-stream-ticket';
import { canPreview } from './preview.utils';
import type { BrowserEntry, FolderPage } from './server/browse';
import { BrowserToolbar } from './ui/browser-toolbar';
import { ConflictDialog } from './ui/conflict-dialog';
import type { DropData } from './ui/dnd';
import { FolderPickerDialog } from './ui/folder-picker-dialog';
import { GridView, tileGap, tileMinWidth } from './ui/grid-view';
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
  const { entries, hasMore, loadingMore, loadMore } = folder;
  const keys = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const [rawSelection, setSelection] = useState(emptySelection);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [view, setView] = useBrowserView();
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
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

  const hrefFor = useCallback((path: string) => browserHref({ ...query, path }), [query]);
  const navigate = (next: BrowserQuery) => {
    router.push(browserHref(next) as Route);
  };
  const open = (entry: BrowserEntry | undefined) => {
    if (entry?.isDirectory) navigate({ ...query, path: entry.path });
    else if (entry && canPreview(entry)) setPreviewPath(entry.path);
  };
  const showPreview = (path: string) => {
    setPreviewPath(path);
    setFocusIndex(entries.findIndex((entry) => entry.path === path));
  };
  const goUp = () => {
    const parent = parentPath(query.path);
    if (parent !== null) navigate({ ...query, path: parent });
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

  const menu = {
    onOpen: open,
    onCopyPath: (entry: BrowserEntry) => {
      void navigator.clipboard.writeText(entry.path).then(() => toast.success(t('pathCopied')));
    },
    onFolderSize: (entry: BrowserEntry) => {
      void startFolderSize({ path: entry.path }).then((result) => {
        if (result.ok) toast(jobsT('started', { name: entry.name }));
        else toast.error(errorMessage(result.error.code, result.error.params));
      });
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
      void folder.refresh();
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
          refreshing={folder.refreshing}
          onRefresh={() => {
            void folder.refresh();
          }}
          onShowShortcuts={() => {
            setHelpOpen(true);
          }}
        />
        {view === 'list' && entries.length > 0 && (
          <ListHeader sort={query.sort} order={query.order} onSort={onSort} />
        )}
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
          {folder.error && entries.length === 0 ? (
            <ErrorState
              code={folder.error.code}
              params={folder.error.params}
              reference={folder.error.requestId}
              onRetry={() => {
                void folder.refresh();
              }}
            />
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
        <footer className="text-muted-foreground flex min-h-10 items-center gap-3 border-t px-4 text-xs md:px-6">
          <span aria-live="polite">{t('count', { count: folder.total })}</span>
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
                  {t('menu.delete')}
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
                  {t('menu.download')}
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
                  {t('menu.copyTo')}
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
                  {t('menu.moveTo')}
                </Button>
              )}
            </span>
          )}
        </footer>
        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <PreviewDialog
          entries={entries}
          path={previewPath}
          onNavigate={showPreview}
          onClose={() => {
            setPreviewPath(null);
          }}
          onDownload={(entry) => void ops.download([entry])}
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
