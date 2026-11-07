'use client';

import { useFormatter } from 'next-intl';
import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => undefined;
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => undefined;

/**
 * Formats a timestamp in the viewer's own time zone. The server only knows its container zone
 * (usually UTC): hydration reuses the server text, then React re-renders with the browser zone.
 */
export function LocalTime({ iso }: { iso: string }) {
  const format = useFormatter();
  const timeZone = useSyncExternalStore(noopSubscribe, browserTimeZone, serverTimeZone);
  const text = format.dateTime(
    new Date(iso),
    timeZone ? { timeStyle: 'medium', timeZone } : { timeStyle: 'medium' },
  );
  return <time dateTime={iso}>{text}</time>;
}
