'use client';

import { useSyncExternalStore } from 'react';

import type { UploadItem } from '../uploads.utils';

/**
 * Uploads of this tab. They live outside React so they survive navigation between pages; the
 * operations panel and the file browser read them through useUploads.
 */
let items: readonly UploadItem[] = [];
const listeners = new Set<() => void>();

function emit(next: readonly UploadItem[]): void {
  items = next;
  for (const listener of listeners) listener();
}

export const uploadStore = {
  add(added: readonly UploadItem[]): void {
    emit([...added, ...items]);
  },
  update(id: string, change: Partial<UploadItem>): void {
    emit(items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  },
  remove(ids: ReadonlySet<string>): void {
    emit(items.filter((item) => !ids.has(item.id)));
  },
  get(id: string): UploadItem | undefined {
    return items.find((item) => item.id === id);
  },
  all(): readonly UploadItem[] {
    return items;
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const none: readonly UploadItem[] = [];

export function useUploads(): readonly UploadItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => none,
  );
}
