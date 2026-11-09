// Release logic shared by the CI checks and the release workflows. Pure: no file or network
// access here, so every rule is covered by release.lib.test.mjs.
import {
  changeTypes,
  changelogFile,
  compareVersionsDesc,
  parseVersion,
} from '@canopy/contracts/changelog';
import { parse, stringify } from 'yaml';

// The schema and version rules live in @canopy/contracts, shared with the web app.
export { changeTypes, changelogFile, compareVersionsDesc, parseVersion };
export const locales = ['en', 'fr', 'es'];

/** Reads a changelog file; an empty file means no entries. */
export function parseChangelog(raw) {
  return changelogFile.safeParse(parse(raw) ?? { entries: [] });
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
