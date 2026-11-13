'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';

import { cn } from 'cn';

import { formatBytes } from '../browser.utils';
import { DndEntry, dropHighlight } from './dnd';
import { EntryMenu } from './entry-menu';
import { EntryThumbnail } from './entry-thumbnail';
import { MenuButton } from './menu-button';
import { initialViewport, modifiersOf, type EntryViewProps } from './view-props';

export const tileMinWidth = 132;
export const tileGap = 12;
const tileHeight = 144;

export function GridView(
  props: EntryViewProps & {
    columns: number;
    /** Thumbnails may load (the stream ticket is set). */
    thumbnails: boolean;
  },
) {
  const { entries, selected, focusIndex, scrollRef, onRendered, columns } = props;
  const locale = useLocale();
  const rowCount = Math.ceil(entries.length / columns);
  // TanStack Virtual returns mutable state the React Compiler cannot memoize; it skips this view.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileHeight + tileGap,
    // The server cannot measure: render a screenful so the first paint is not empty.
    initialRect: initialViewport,
    overscan: 4,
  });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = Math.min(((rows.at(-1)?.index ?? 0) + 1) * columns, entries.length) - 1;

  useEffect(() => {
    onRendered(lastIndex);
  }, [lastIndex, onRendered]);

  useEffect(() => {
    if (focusIndex >= 0)
      virtualizer.scrollToIndex(Math.floor(focusIndex / columns), { align: 'auto' });
  }, [focusIndex, columns, virtualizer]);

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="absolute inset-x-0 top-0 grid"
          style={{
            transform: `translateY(${row.start}px)`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: tileGap,
            height: tileHeight,
          }}
        >
          {entries
            .slice(row.index * columns, row.index * columns + columns)
            .map((entry, offset) => {
              const index = row.index * columns + offset;
              const isSelected = selected.has(entry.path);
              return (
                <DndEntry key={entry.path} entry={entry} draggable={props.canDrag(entry)}>
                  {(dnd) => (
                    <EntryMenu entry={entry} {...props.menu}>
                      <div
                        ref={dnd.ref}
                        {...dnd.listeners}
                        id={props.idOf(index)}
                        role="option"
                        aria-selected={isSelected}
                        title={props.showLocation ? entry.path : entry.name}
                        className={cn(
                          'relative flex cursor-default flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-sm select-none',
                          isSelected
                            ? 'border-primary bg-accent text-accent-foreground'
                            : 'hover:bg-muted/60',
                          index === focusIndex && 'ring-ring ring-2',
                          dropHighlight(dnd.isOver, dnd.isDragging),
                        )}
                        onClick={(event) => {
                          props.onClick(index, modifiersOf(event));
                        }}
                        onDoubleClick={() => {
                          props.onOpen(index);
                        }}
                      >
                        <MenuButton className="absolute top-1 right-1" />
                        <EntryThumbnail key={entry.path} entry={entry} enabled={props.thumbnails} />
                        <span className="line-clamp-2 w-full font-medium break-all">
                          {entry.name}
                        </span>
                        {!entry.isDirectory && (
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatBytes(entry.size, locale)}
                          </span>
                        )}
                      </div>
                    </EntryMenu>
                  )}
                </DndEntry>
              );
            })}
        </div>
      ))}
    </div>
  );
}
