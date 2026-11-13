'use client';

import { Cast, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { CommandEntry } from '@canopy/contracts';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';
import { localized } from '@/features/commands';

import { formatBytes } from '../../browser.utils';
import { useStreamTicket } from '../../model/use-stream-ticket';
import { previewHref } from '../../operations.utils';
import { previewNeighbours } from '../../preview.utils';
import type { BrowserEntry } from '../../server/browse';
import { PreviewMessage } from './preview-message';
import { TextPreview } from './text-preview';
import { VideoPreview } from './video-preview';

interface PreviewDialogProps {
  /** The loaded entries of the folder: previous / next walk through them. */
  entries: readonly BrowserEntry[];
  /** The file shown, or null when the viewer is closed. */
  path: string | null;
  onNavigate: (path: string) => void;
  onClose: () => void;
  onDownload: (entry: BrowserEntry) => void;
  /** The commands that play this file on a screen (none: no Cast button). */
  castWith: (entry: BrowserEntry) => readonly CommandEntry[];
  onCast: (entry: BrowserEntry, command: CommandEntry) => void;
}

/** Views a file without leaving the folder; arrows go to the previous or next previewable file. */
export function PreviewDialog({
  entries,
  path,
  onNavigate,
  onClose,
  onDownload,
  castWith,
  onCast,
}: PreviewDialogProps) {
  const t = useTranslations('files.preview');
  const locale = useLocale();
  const entry = path === null ? undefined : entries.find((item) => item.path === path);
  const ticket = useStreamTicket(entry !== undefined);
  const { previous, next } = previewNeighbours(entries, path ?? '');

  // On the document: focus may sit on a button that just became disabled (first or last file).
  useEffect(() => {
    if (path === null) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // Media controls use the arrows to seek.
      if (event.target instanceof HTMLMediaElement) return;
      const target =
        event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : undefined;
      if (!target) return;
      event.preventDefault();
      onNavigate(target.path);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [path, previous, next, onNavigate]);

  if (!entry) return null;
  const casts = castWith(entry);
  const castButton = (onClick?: () => void) => (
    <Button variant="ghost" size="sm" aria-label={t('cast')} onClick={onClick}>
      <Cast aria-hidden />
      <span className="max-sm:sr-only">{t('cast')}</span>
    </Button>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(90svh,60rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none max-sm:pb-0 sm:max-w-6xl"
      >
        <header className="flex items-center gap-1 border-b py-2 pr-2 pl-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{entry.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {formatBytes(entry.size, locale)}
            </DialogDescription>
          </div>
          {casts.length === 1 &&
            castButton(() => {
              if (casts[0]) onCast(entry, casts[0]);
            })}
          {casts.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{castButton()}</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {casts.map((command) => (
                  <DropdownMenuItem
                    key={command.id}
                    onSelect={() => {
                      onCast(entry, command);
                    }}
                  >
                    {localized(command.name, locale)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-10"
            disabled={!previous}
            aria-label={t('previous')}
            onClick={() => {
              if (previous) onNavigate(previous.path);
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-10"
            disabled={!next}
            aria-label={t('next')}
            onClick={() => {
              if (next) onNavigate(next.path);
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-10"
            aria-label={t('download')}
            onClick={() => {
              onDownload(entry);
            }}
          >
            <Download aria-hidden />
          </Button>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-10"
              aria-label={t('close')}
            >
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        <div className="bg-muted/40 relative min-h-0 flex-1">
          {ticket === 'ready' ? (
            <PreviewBody
              key={entry.path}
              entry={entry}
              onDownload={() => {
                onDownload(entry);
              }}
            />
          ) : ticket === 'failed' ? (
            <PreviewMessage title={t('failed')} />
          ) : (
            <div className="grid h-full place-items-center">
              <Spinner className="size-6" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The viewer for one file; remounted per file so media and errors start fresh. */
function PreviewBody({ entry, onDownload }: { entry: BrowserEntry; onDownload: () => void }) {
  const t = useTranslations('files.preview');
  const [failed, setFailed] = useState(false);
  const href = previewHref(entry.path);
  const onError = () => {
    setFailed(true);
  };
  if (failed) return <PreviewMessage title={t('failed')} />;

  switch (entry.preview) {
    case 'image':
      return (
        <Image
          src={href}
          alt={entry.name}
          fill
          unoptimized
          className="object-contain p-2"
          onError={onError}
        />
      );
    case 'video':
      return <VideoPreview entry={entry} onDownload={onDownload} />;
    case 'audio':
      return (
        <div className="grid h-full place-items-center p-6">
          <audio src={href} controls className="w-full max-w-xl" onError={onError} />
        </div>
      );
    case 'pdf':
      return <iframe src={href} title={entry.name} className="size-full" />;
    case 'html':
      // No scripts, no origin: the engine also serves it under a sandbox policy.
      return (
        <iframe
          src={href}
          title={entry.name}
          sandbox=""
          className="size-full [color-scheme:light]"
        />
      );
    case 'text':
      return <TextPreview href={href} name={entry.name} size={entry.size} />;
    case 'none':
      return <PreviewMessage title={t('unsupported')} />;
  }
}
