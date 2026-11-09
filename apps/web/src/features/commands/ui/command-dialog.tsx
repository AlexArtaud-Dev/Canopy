'use client';

import { useLocale } from 'next-intl';

import type { CommandEntry } from '@canopy/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

import { localized, type FormValue } from '../commands.utils';
import { CommandRunner } from './command-runner';

interface CommandDialogProps {
  /** The command to run; null closes the dialog. */
  entry: CommandEntry | null;
  preset: Readonly<Record<string, FormValue>>;
  onClose: () => void;
}

/**
 * A catalog command over the file browser, with the folder already filled in. Closing it does
 * not stop a run: it goes on in the operations panel.
 */
export function CommandDialog({ entry, preset, onClose }: CommandDialogProps) {
  const locale = useLocale();
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {entry && (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{localized(entry.name, locale)}</DialogTitle>
            <DialogDescription>{localized(entry.description, locale)}</DialogDescription>
          </DialogHeader>
          <CommandRunner key={entry.id} entry={entry} preset={preset} focusFirst />
        </DialogContent>
      )}
    </Dialog>
  );
}
