'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback, type ReactNode } from 'react';

import { cn } from 'cn';

import type { BrowserEntry } from '../server/browse';

export interface DropData {
  path: string;
}

interface DndEntryProps {
  entry: BrowserEntry;
  /** May be moved or copied by dragging (the engine still checks on drop). */
  draggable: boolean;
  children: (dnd: {
    ref: (element: HTMLElement | null) => void;
    listeners: Record<string, unknown> | undefined;
    isOver: boolean;
    isDragging: boolean;
  }) => ReactNode;
}

/** Makes a row or tile draggable, and a drop target when it is a folder. */
export function DndEntry({ entry, draggable, children }: DndEntryProps) {
  const {
    setNodeRef: setDragRef,
    listeners,
    isDragging,
  } = useDraggable({ id: entry.path, disabled: !draggable });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${entry.path}`,
    disabled: !entry.isDirectory,
    data: { path: entry.path } satisfies DropData,
  });
  // Must stay the same function across renders: a new ref callback detaches and re-attaches the
  // node on every render during a drag, and dnd-kit then drops this folder from its targets.
  const ref = useCallback(
    (element: HTMLElement | null) => {
      setDragRef(element);
      setDropRef(element);
    },
    [setDragRef, setDropRef],
  );
  return children({ ref, listeners, isOver, isDragging });
}

/** A breadcrumb segment that accepts drops (move or copy up the tree). */
export function DropCrumb({ path, children }: { path: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `crumb:${path}`,
    data: { path } satisfies DropData,
  });
  return (
    <span
      ref={setNodeRef}
      className={cn(
        'flex min-w-0 items-center rounded-md',
        isOver && 'bg-primary/15 ring-primary ring-2',
      )}
    >
      {children}
    </span>
  );
}

/** Classes for a folder highlighted under the pointer during a drag. */
export function dropHighlight(isOver: boolean, isDragging: boolean): string {
  return cn(isOver && 'bg-primary/15 ring-primary ring-2 ring-inset', isDragging && 'opacity-50');
}
