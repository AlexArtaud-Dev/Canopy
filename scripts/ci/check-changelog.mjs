#!/usr/bin/env node
// Validates changelog YAML files against the schema in docs/dev/git-and-release.md.
// Usage: node scripts/ci/check-changelog.mjs [files...]
// (defaults to changelog/unreleased.yaml and every changelog/releases/*.yaml)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { parseChangelog, versionOfReleaseFile } from '../release/release.lib.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const files = process.argv.slice(2);
if (files.length === 0) {
  files.push('changelog/unreleased.yaml');
  const releases = await readdir(path.resolve(root, 'changelog/releases'));
  files.push(
    ...releases
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => `changelog/releases/${name}`),
  );
}

let failed = false;
for (const file of files) {
  if (file.startsWith('changelog/releases/') && versionOfReleaseFile(file) === null) {
    failed = true;
    console.error(`${file}: release files are named <YYYY.M.MICRO>.yaml`);
    continue;
  }
  const result = parseChangelog(await readFile(path.resolve(root, file), 'utf8'));
  if (result.success) {
    console.log(`${file}: ${result.data.entries.length} valid entries`);
    continue;
  }
  failed = true;
  console.error(`${file}: invalid\n${z.prettifyError(result.error)}`);
}
process.exit(failed ? 1 : 0);
