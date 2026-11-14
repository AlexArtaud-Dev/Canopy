'use client';

import { unstable_isUnrecognizedActionError } from 'next/navigation';
import { useEffect } from 'react';

import { unexpectedErrorCode } from '@/shared/lib/errors';

/** At most one automatic reload in this window: a server that keeps refusing must not loop. */
const reloadGuardMs = 30_000;
const storageKey = 'canopy.reloadedForVersionAt';

/**
 * Canopy was updated while this tab was open: the page's code calls server actions the new
 * server no longer knows (Next answers 409 "Server Action unavailable"). Only a reload helps.
 */
export function isStaleVersionError(error: unknown): boolean {
  return error instanceof Error && unstable_isUnrecognizedActionError(error);
}

/** Whether reloading now is allowed, given when the tab last reloaded for this reason. */
export function mayReloadAgain(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt >= reloadGuardMs;
}

/** Reloads the page once for a new version; false when it just did (then the error shows). */
export function reloadForNewVersion(): boolean {
  let last: number | null = null;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    last = stored === null ? null : Number(stored);
  } catch {
    // Without storage the guard is off for this tab: still better than a stuck page.
  }
  const now = Date.now();
  if (!mayReloadAgain(Number.isFinite(last) ? last : null, now)) return false;
  try {
    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    // See above.
  }
  window.location.reload();
  return true;
}

/** The code an error page shows; a new version reloads the page by itself. */
export function useStaleVersionRecovery(error: unknown): string {
  const stale = isStaleVersionError(error);
  useEffect(() => {
    if (stale) reloadForNewVersion();
  }, [stale]);
  return stale ? staleVersionCode : unexpectedErrorCode;
}

/** Shown while the page reloads for a new version. */
export const staleVersionCode = 'system.updated';
