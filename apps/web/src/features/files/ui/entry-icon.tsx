import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  type LucideIcon,
} from 'lucide-react';

import { cn } from 'cn';

import type { FileKind } from '../browser.utils';

const icons: Record<FileKind, LucideIcon> = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  document: FileText,
  file: File,
};

/** Folders take the primary color so they stand out from files at a glance. */
export function EntryIcon({
  kind,
  className,
  strokeWidth,
}: {
  kind: FileKind;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = icons[kind];
  return (
    <Icon
      aria-hidden
      strokeWidth={strokeWidth}
      className={cn(
        'shrink-0',
        kind === 'folder' ? 'fill-primary/15 text-primary' : 'text-muted-foreground',
        className,
      )}
    />
  );
}
