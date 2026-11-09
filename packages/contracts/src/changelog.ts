// Hand-written (not generated): the changelog file schema shared by the release scripts and the
// web app's "What's new". See docs/dev/git-and-release.md.
import { z } from 'zod';

export const changeTypes = [
  'feat',
  'fix',
  'perf',
  'security',
  'refactor',
  'docs',
  'chore',
] as const;
export type ChangeType = (typeof changeTypes)[number];

const translatedText = z.object({
  en: z.string().trim().min(1),
  fr: z.string().trim().min(1),
  es: z.string().trim().min(1),
});

export const changelogEntry = z.object({
  type: z.enum(changeTypes),
  scope: z.string().regex(/^[a-z][a-z0-9-]*$/, 'kebab-case scope'),
  issue: z.number().int().positive(),
  text: translatedText,
});
export type ChangelogEntry = z.infer<typeof changelogEntry>;

/** `changelog/unreleased.yaml`, and `changelog/releases/<version>.yaml` (which adds `date`). */
export const changelogFile = z
  .object({ date: z.iso.date().optional(), entries: z.array(changelogEntry) })
  .strict();
export type ChangelogFile = z.infer<typeof changelogFile>;

export interface CalVer {
  year: number;
  month: number;
  micro: number;
}

const calver = /^(\d{4})\.(\d{1,2})\.(\d+)$/;

/** `2026.11.0` → its parts, or null when the text is not a CalVer version (`YYYY.M.MICRO`). */
export function parseVersion(text: string): CalVer | null {
  const match = calver.exec(text);
  if (!match) return null;
  const [year, month, micro] = match.slice(1).map(Number) as [number, number, number];
  return month >= 1 && month <= 12 ? { year, month, micro } : null;
}

/** Newest first; text that is not a version sorts last. */
export function compareVersionsDesc(a: string, b: string): number {
  const none: CalVer = { year: 0, month: 0, micro: 0 };
  const left = parseVersion(a) ?? none;
  const right = parseVersion(b) ?? none;
  return right.year - left.year || right.month - left.month || right.micro - left.micro;
}
