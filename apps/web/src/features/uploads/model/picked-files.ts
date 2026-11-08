'use client';

import { relativeDirOf, type PickedFile } from '../uploads.utils';

/** Files from an <input type="file">, with their folders when a folder was picked. */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? [], (file) => ({
    file,
    relativeDir: relativeDirOf(file.webkitRelativePath),
  }));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function collect(entry: FileSystemEntry, dir: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    out.push({ file: await fileOf(entry as FileSystemFileEntry), relativeDir: dir });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const childDir = dir === '' ? entry.name : `${dir}/${entry.name}`;
  // readEntries returns batches until an empty one.
  for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
    for (const child of batch) await collect(child, childDir, out);
  }
}

/** Files dropped from the desktop, walking into dropped folders. */
export async function filesFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return filesFromInput(transfer.files);
  const out: PickedFile[] = [];
  for (const entry of entries) await collect(entry, '', out);
  return out;
}
