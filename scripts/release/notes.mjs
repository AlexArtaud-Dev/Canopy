#!/usr/bin/env node
// Prints the GitHub Release notes of a version, rendered from its changelog file.
// Usage: node scripts/release/notes.mjs <version> <owner/repo>
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseChangelog, parseVersion, renderNotes } from './release.lib.mjs';

const [version, repository] = process.argv.slice(2);
if (!version || !parseVersion(version) || !repository) {
  console.error('Usage: node scripts/release/notes.mjs <YYYY.M.MICRO> <owner/repo>');
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, '../..');
const file = await readFile(path.resolve(root, `changelog/releases/${version}.yaml`), 'utf8');
const changelog = parseChangelog(file);
if (!changelog.success) {
  console.error(`changelog/releases/${version}.yaml is invalid`);
  process.exit(1);
}
process.stdout.write(renderNotes(changelog.data.entries, repository));
