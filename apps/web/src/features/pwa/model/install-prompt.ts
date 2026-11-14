'use client';

import { useSyncExternalStore } from 'react';

/** Chrome and Edge's install event (not in the DOM typings yet). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function';
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * Registers the service worker and keeps the browser's install offer for later: Canopy shows its
 * own "Install the app" entry instead of the browser's banner. Called once, from the root layout.
 */
export function startInstallSupport(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isInstallPromptEvent(event)) return;
    event.preventDefault();
    deferred = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens the browser's install dialog, when it offers one; null otherwise (installed, iOS…). */
export function useInstallApp(): (() => void) | null {
  const event = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );
  if (!event) return null;
  return () => {
    void event.prompt().then(async () => {
      await event.userChoice;
      // The browser offers again later if the person declined; until then, nothing to show.
      deferred = null;
      notify();
    });
  };
}
