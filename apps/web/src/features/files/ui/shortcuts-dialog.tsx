'use client';

import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Kbd, KbdGroup } from '@/shared/ui/kbd';

const shortcuts = [
  { id: 'move', keys: ['↑', '↓', '←', '→'] },
  { id: 'jump', keys: ['Home', 'End', 'PgUp', 'PgDn'] },
  { id: 'open', keys: ['Enter'] },
  { id: 'up', keys: ['Backspace'] },
  { id: 'select', keys: ['Space'] },
  { id: 'extend', keys: ['Shift', '↑ ↓'] },
  { id: 'selectAll', keys: ['Ctrl', 'A'] },
  { id: 'rename', keys: ['F2'] },
  { id: 'copy', keys: ['Ctrl', 'C'] },
  { id: 'cut', keys: ['Ctrl', 'X'] },
  { id: 'paste', keys: ['Ctrl', 'V'] },
  { id: 'dragCopy', keys: ['Ctrl', '⇱'] },
  { id: 'delete', keys: ['Del'] },
  { id: 'deletePermanently', keys: ['Shift', 'Del'] },
  { id: 'clear', keys: ['Esc'] },
  { id: 'menu', keys: ['Shift', 'F10'] },
  { id: 'help', keys: ['?'] },
] as const;

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('files.browser.shortcuts');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2.5 text-sm">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.id} className="flex items-center justify-between gap-4">
              <dt>{t(`keys.${shortcut.id}`)}</dt>
              <dd>
                <KbdGroup>
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
