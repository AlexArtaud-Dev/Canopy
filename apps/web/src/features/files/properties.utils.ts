import { z } from 'zod';

/** Permission bits as `chmod` writes them, e.g. 488 → `750`. */
export function formatOctal(permissions: number): string {
  return (permissions & 0o7777).toString(8).padStart(3, '0');
}

const folderSizeSchema = z.object({
  bytes: z.number(),
  files: z.number(),
  folders: z.number(),
  skipped: z.number().catch(0),
});
export type FolderSize = z.infer<typeof folderSizeSchema>;

/** A folder-size job's outcome, or null while it has none (or an unexpected shape). */
export function readFolderSize(result: unknown): FolderSize | null {
  const parsed = folderSizeSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

const checksumSchema = z.object({ algorithm: z.string(), hash: z.string().regex(/^[0-9a-f]+$/) });

/** A checksum job's digest, or null while it has none. */
export function readChecksum(result: unknown): string | null {
  const parsed = checksumSchema.safeParse(result);
  return parsed.success ? parsed.data.hash : null;
}
