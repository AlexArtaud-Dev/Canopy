'use client';

import { MoreVertical } from 'lucide-react';

import { cn } from 'cn';

/**
 * The visible way to an item's actions on a touch screen, where a right click does not exist and
 * a long press is hidden knowledge. It opens the item's own context menu, at the mark. Like the
 * selection mark it is not a control of its own: the row is the `option`, and a button inside
 * it would be nested interactive content; keyboards and screen readers open the same menu with
 * the context menu key (or Shift+F10).
 */
export function MenuButton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-muted-foreground hover:bg-muted hidden size-10 shrink-0 items-center justify-center rounded-md pointer-coarse:flex',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        const trigger = event.currentTarget.closest('[data-slot="context-menu-trigger"]');
        const box = event.currentTarget.getBoundingClientRect();
        trigger?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: box.left,
            clientY: box.bottom,
          }),
        );
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    >
      <MoreVertical className="size-4" />
    </span>
  );
}
