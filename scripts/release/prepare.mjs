#!/usr/bin/env node
// Prepares a release in the working tree: moves changelog/unreleased.yaml to
// changelog/releases/<version>.yaml and sets the web app's version. Prints the version, and
// writes it to $GITHUB_OUTPUT when run in a workflow. Commits nothing.
import { appendFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  nextVersion,
  parseChangelog,
  releaseFileContent,
  versionOfReleaseFile,
} from './release.lib.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const unreleasedPath = path.resolve(root, 'changelog/unreleased.yaml');
const releasesDir = path.resolve(root, 'changelog/releases');
const webPackagePath = path.resolve(root, 'apps/web/package.json');

const unreleased = parseChangelog(await readFile(unreleasedPath, 'utf8'));
if (!unreleased.success) {
  console.error(`changelog/unreleased.yaml is invalid\n${z.prettifyError(unreleased.error)}`);
  process.exit(1);
}
if (unreleased.data.entries.length === 0) {
  console.error('Nothing to release: changelog/unreleased.yaml has no entries.');
  process.exit(1);
}

const existing = (await readdir(releasesDir))
  .map((name) => versionOfReleaseFile(`changelog/releases/${name}`))
  .filter((version) => version !== null);
const now = new Date();
const version = nextVersion(now, existing);

await writeFile(
  path.resolve(releasesDir, `${version}.yaml`),
  releaseFileContent(unreleased.data.entries, now),
);
await writeFile(unreleasedPath, 'entries: []\n');

const webPackage = JSON.parse(await readFile(webPackagePath, 'utf8'));
webPackage.version = version;
await writeFile(webPackagePath, `${JSON.stringify(webPackage, null, 2)}\n`);

console.log(version);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`);
