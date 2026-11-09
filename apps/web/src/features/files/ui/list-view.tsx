'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { cn } from 'cn';

import { fileKind, formatBytes, parentPath, type SortKey, type SortOrder } from '../browser.utils';
import { EntryIcon } from './entry-icon';
import { DndEntry, dropHighlight } from './dnd';
import { EntryMenu } from './entry-menu';
import { SelectionMark } from './selection-mark';
import { initialViewport, modifiersOf, type EntryViewProps } from './view-props';

/** Rows are 44 px: the minimum touch target. */
const rowHeight = 44;
export const listColumns =
  'grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[2.25rem_minmax(0,1fr)_6rem_11rem]';

export function ListView(props: EntryViewProps) {
  const { entries, selected, focusIndex, scrollRef, onRendered } = props;
  const format = useFormatter();
  const locale = useLocale();
  // TanStack Virtual returns mutable state the React Compiler cannot memoize; it skips this view.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    // The server cannot measure: render a screenful so the first paint is not empty.
    initialRect: initialViewport,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;

  useEffect(() => {
    onRendered(lastIndex);
  }, [lastIndex, onRendered]);

  useEffect(() => {
    if (focusIndex >= 0) virtualizer.scrollToIndex(focusIndex, { align: 'auto' });
  }, [focusIndex, virtualizer]);

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((item) => {
        const entry = entries[item.index];
        if (!entry) return null;
        const isSelected = selected.has(entry.path);
        const modified = format.dateTime(new Date(entry.modified), {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        return (
          <DndEntry key={entry.path} entry={entry} draggable={props.canDrag(entry)}>
            {(dnd) => (
              <EntryMenu entry={entry} {...props.menu}>
                <div
                  ref={dnd.ref}
                  {...dnd.listeners}
                  id={props.idOf(item.index)}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'group absolute inset-x-0 top-0 grid cursor-default items-center gap-x-3 border-b px-2 text-sm select-none',
                    listColumns,
                    isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
                    item.index === focusIndex && 'ring-ring ring-2 ring-inset',
                    dropHighlight(dnd.isOver, dnd.isDragging),
                  )}
                  // `top`, not a transform: drop targets are measured without their own transform.
                  style={{ height: rowHeight, top: item.start }}
                  onClick={(event) => {
                    props.onClick(item.index, modifiersOf(event));
                  }}
                  onDoubleClick={() => {
                    props.onOpen(item.index);
                  }}
                >
                  <span className="flex justify-center">
                    <SelectionMark
                      checked={isSelected}
                      className={cn(
                        'opacity-0 transition-opacity group-hover:opacity-100',
                        (isSelected || selected.size > 0) && 'opacity-100',
                        'pointer-coarse:opacity-100',
                      )}
                      onToggle={() => {
                        props.onToggle(item.index);
                      }}
                    />
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <EntryIcon kind={fileKind(entry.name, entry.isDirectory)} className="size-5" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.name}</span>
                      {props.showLocation ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {parentPath(entry.path) ?? '/'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground block truncate text-xs sm:hidden">
                          {entry.isDirectory
                            ? modified
                            : `${formatBytes(entry.size, locale)} · ${modified}`}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-muted-foreground hidden text-right tabular-nums sm:block">
                    {entry.isDirectory ? '—' : formatBytes(entry.size, locale)}
                  </span>
                  <span className="text-muted-foreground hidden truncate sm:block">{modified}</span>
                </div>
              </EntryMenu>
            )}
          </DndEntry>
        );
      })}
    </div>
  );
}

/** Column headers of the list; clicking one sorts by it (again: reverses). */
export function ListHeader({
  sort,
  order,
  onSort,
}: {
  sort: SortKey;
  order: SortOrder;
  onSort: (key: SortKey) => void;
}) {
  const t = useTranslations('files.browser');
  const Arrow = order === 'asc' ? ArrowUp : ArrowDown;
  const column = (key: SortKey, className: string) => (
    <button
      type="button"
      className={cn('hover:text-foreground flex items-center gap-1 py-2', className)}
      onClick={() => {
        onSort(key);
      }}
    >
      {t(`sort.${key}`)}
      {sort === key && (
        <>
          <Arrow className="size-3" aria-hidden />
          {/* aria-sort belongs to table headers; this list states the order in words. */}
          <span className="sr-only">{order === 'asc' ? t('ascending') : t('descending')}</span>
        </>
      )}
    </button>
  );
  return (
    <div
      className={cn(
        'text-muted-foreground grid items-center gap-x-3 border-b px-2 text-xs font-medium',
        listColumns,
      )}
    >
      <span />
      {column('name', '')}
      {column('size', 'hidden justify-end sm:flex')}
      {column('modified', 'hidden sm:flex')}
    </div>
  );
}
