import type { MouseEvent, RefObject } from 'react';

import type { BrowserEntry } from '../server/browse';
import type { EntryMenuHandlers } from './entry-menu';

export interface ClickModifiers {
  /** Ctrl or Cmd: add or remove one entry. */
  toggle: boolean;
  /** Shift: extend from the anchor. */
  range: boolean;
  /** Touch taps open entries directly, as phones do. */
  touch: boolean;
}

/** Shared by the list and grid views: presentation only, every decision is the container's. */
export interface EntryViewProps {
  entries: readonly BrowserEntry[];
  selected: ReadonlySet<string>;
  focusIndex: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Called with the last rendered index so more entries can be fetched before the end. */
  onRendered: (lastIndex: number) => void;
  onClick: (index: number, modifiers: ClickModifiers) => void;
  onOpen: (index: number) => void;
  onToggle: (index: number) => void;
  menu: EntryMenuHandlers;
  /** Whether an entry may be dragged (the person may move or copy it). */
  canDrag: (entry: BrowserEntry) => boolean;
  idOf: (index: number) => string;
  /** Search results come from many folders: each shows where it is. */
  showLocation?: boolean;
}

export function modifiersOf(event: MouseEvent): ClickModifiers {
  const native = event.nativeEvent as PointerEvent;
  return {
    toggle: event.ctrlKey || event.metaKey,
    range: event.shiftKey,
    touch: native.pointerType === 'touch',
  };
}

/** Assumed scroll area before it can be measured (server render, first client frame). */
export const initialViewport = { width: 1024, height: 900 };
