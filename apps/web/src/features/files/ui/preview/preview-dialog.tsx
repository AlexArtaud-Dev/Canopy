'use client';

import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';

import { formatBytes } from '../../browser.utils';
import { useStreamTicket } from '../../model/use-stream-ticket';
import { previewHref } from '../../operations.utils';
import { previewNeighbours } from '../../preview.utils';
import type { BrowserEntry } from '../../server/browse';
import { PreviewMessage } from './preview-message';
import { TextPreview } from './text-preview';

interface PreviewDialogProps {
  /** The loaded entries of the folder: previous / next walk through them. */
  entries: readonly BrowserEntry[];
  /** The file shown, or null when the viewer is closed. */
  path: string | null;
  onNavigate: (path: string) => void;
  onClose: () => void;
  onDownload: (entry: BrowserEntry) => void;
}

/** Views a file without leaving the folder; arrows go to the previous or next previewable file. */
export function PreviewDialog({
  entries,
  path,
  onNavigate,
  onClose,
  onDownload,
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

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(90svh,60rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <header className="flex items-center gap-1 border-b py-2 pr-2 pl-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{entry.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {formatBytes(entry.size, locale)}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
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
            aria-label={t('download')}
            onClick={() => {
              onDownload(entry);
            }}
          >
            <Download aria-hidden />
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('close')}>
              <X aria-hidden />
            </Button>
          </DialogClose>
        </header>
        <div className="bg-muted/40 relative min-h-0 flex-1">
          {ticket === 'ready' ? (
            <PreviewBody key={entry.path} entry={entry} />
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
function PreviewBody({ entry }: { entry: BrowserEntry }) {
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
      return (
        <video
          src={href}
          controls
          playsInline
          className="size-full object-contain"
          onError={onError}
        />
      );
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
