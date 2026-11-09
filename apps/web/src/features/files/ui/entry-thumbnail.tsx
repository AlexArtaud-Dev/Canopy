'use client';

import Image from 'next/image';
import { useState } from 'react';

import { fileKind } from '../browser.utils';
import { thumbnailHref } from '../operations.utils';
import type { BrowserEntry } from '../server/browse';
import { EntryIcon } from './entry-icon';

/** Thumbnail height in grid tiles; the icon takes the same room, so tiles never jump. */
const thumbnailBox = 'h-14 w-20';

/**
 * The engine's thumbnail when it offers one and the stream ticket is ready; the icon otherwise,
 * and again if the thumbnail fails (unsupported after all, permission changed, engine down).
 */
export function EntryThumbnail({ entry, enabled }: { entry: BrowserEntry; enabled: boolean }) {
  const [failed, setFailed] = useState(false);
  const shown = enabled && !failed && entry.thumbnail && entry.actions.includes('download');
  if (!shown) {
    return (
      <span className={`grid place-items-center ${thumbnailBox}`}>
        <EntryIcon
          kind={fileKind(entry.name, entry.isDirectory)}
          className="size-10"
          strokeWidth={1.5}
        />
      </span>
    );
  }
  return (
    <Image
      src={thumbnailHref(entry.path, entry.modified)}
      alt=""
      width={80}
      height={56}
      unoptimized
      loading="lazy"
      draggable={false}
      className={`bg-muted rounded-md object-cover ${thumbnailBox}`}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
