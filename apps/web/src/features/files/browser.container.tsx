'use client';

import { FolderOpen, FolderTree, X } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { ErrorState } from '@/shared/errors/error-state';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Spinner } from '@/shared/ui/spinner';

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
import { useFolder } from './model/use-folder';
import type { BrowserEntry, FolderPage } from './server/browse';
import { BrowserToolbar } from './ui/browser-toolbar';
import { GridView, tileGap, tileMinWidth } from './ui/grid-view';
import { ListHeader, ListView } from './ui/list-view';
import { ShortcutsDialog } from './ui/shortcuts-dialog';
import type { ClickModifiers } from './ui/view-props';

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
  const router = useRouter();
  const folder = useFolder(query, firstPage);
  const { entries, hasMore, loadingMore, loadMore } = folder;
  const keys = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const [rawSelection, setSelection] = useState(emptySelection);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [view, setView] = useBrowserView();
  const [helpOpen, setHelpOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
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
  };

  const onSort = (key: SortKey) => {
    navigate({ ...query, ...nextSort(query, key) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BrowserToolbar
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
        className={
          view === 'grid'
            ? 'min-h-0 flex-1 overflow-y-auto p-4 outline-none'
            : 'min-h-0 flex-1 overflow-y-auto outline-none'
        }
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
          <GridView {...viewProps} columns={columns} />
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
      </footer>
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
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
