'use client';

import { MoreVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from 'cn';

/**
 * The visible way to an item's actions on a touch screen, where a right click does not exist and
 * a long press is hidden knowledge. It opens the item's own context menu, at the button.
 */
export function MenuButton({ name, className }: { name: string; className?: string }) {
  const t = useTranslations('files.browser');
  return (
    <button
      type="button"
      aria-label={t('itemMenu', { name })}
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
      <MoreVertical aria-hidden className="size-4" />
    </button>
  );
}
