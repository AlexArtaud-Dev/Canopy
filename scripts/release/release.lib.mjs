// Release logic shared by the CI checks and the release workflows. Pure: no file or network
// access here, so every rule is covered by release.lib.test.mjs.
import { parse, stringify } from 'yaml';
import { z } from 'zod';

export const changeTypes = ['feat', 'fix', 'perf', 'security', 'refactor', 'docs', 'chore'];
export const locales = ['en', 'fr', 'es'];

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

/** `changelog/unreleased.yaml`, and `changelog/releases/<version>.yaml` (which adds `date`). */
export const changelogFile = z
  .object({ date: z.iso.date().optional(), entries: z.array(changelogEntry) })
  .strict();

/** Reads a changelog file; an empty file means no entries. */
export function parseChangelog(raw) {
  return changelogFile.safeParse(parse(raw) ?? { entries: [] });
}

const calver = /^(\d{4})\.(\d{1,2})\.(\d+)$/;

/** `2026.11.0` → its parts, or null when the text is not a CalVer version. */
export function parseVersion(text) {
  const match = calver.exec(text);
  if (!match) return null;
  const [year, month, micro] = match.slice(1).map(Number);
  return month >= 1 && month <= 12 ? { year, month, micro } : null;
}

/**
 * The next CalVer version (`YYYY.MM.MICRO`, no zero padding): MICRO counts the releases of the
 * current UTC month and starts again at 0 each month.
 */
export function nextVersion(now, existing) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const micros = existing
    .map(parseVersion)
    .filter((version) => version && version.year === year && version.month === month)
    .map((version) => version.micro);
  const micro = micros.length === 0 ? 0 : Math.max(...micros) + 1;
  return `${year}.${month}.${micro}`;
}

/** Newest first: what the in-app "What's new" and release listings use. */
export function compareVersionsDesc(a, b) {
  const left = parseVersion(a) ?? { year: 0, month: 0, micro: 0 };
  const right = parseVersion(b) ?? { year: 0, month: 0, micro: 0 };
  return right.year - left.year || right.month - left.month || right.micro - left.micro;
}

/** The YAML of a release file: the release date, then the entries moved out of Unreleased. */
export function releaseFileContent(entries, now) {
  const date = now.toISOString().slice(0, 10);
  return stringify({ date, entries }, { lineWidth: 0 });
}

const headings = {
  feat: 'New',
  fix: 'Fixes',
  perf: 'Performance',
  security: 'Security',
  refactor: 'Internal changes',
  docs: 'Documentation',
  chore: 'Maintenance',
};

/** GitHub Release notes in Markdown: one section per change type, in a fixed order. */
export function renderNotes(entries, repository) {
  const sections = changeTypes
    .map((type) => {
      const items = entries.filter((entry) => entry.type === type);
      if (items.length === 0) return null;
      const lines = items.map(
        (entry) =>
          `- **${entry.scope}**: ${entry.text.en} ([#${entry.issue}](https://github.com/${repository}/issues/${entry.issue}))`,
      );
      return `### ${headings[type]}\n\n${lines.join('\n')}`;
    })
    .filter((section) => section !== null);
  return sections.length === 0 ? 'No user-facing changes.\n' : `${sections.join('\n\n')}\n`;
}

/** `changelog/releases/2026.11.0.yaml` → `2026.11.0`; anything else → null. */
export function versionOfReleaseFile(file) {
  const match = /(?:^|\/)changelog\/releases\/([^/]+)\.yaml$/.exec(file);
  return match && parseVersion(match[1]) ? match[1] : null;
}
