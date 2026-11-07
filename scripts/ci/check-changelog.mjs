#!/usr/bin/env node
// Validates changelog YAML files against the schema in docs/dev/git-and-release.md.
// Usage: node scripts/ci/check-changelog.mjs [files...] (defaults to changelog/unreleased.yaml)
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

const translatedText = z.object({
  en: z.string().trim().min(1),
  fr: z.string().trim().min(1),
  es: z.string().trim().min(1),
});

const entry = z.object({
  type: z.enum(['feat', 'fix', 'perf', 'security', 'refactor', 'docs', 'chore']),
  scope: z.string().regex(/^[a-z][a-z0-9-]*$/, 'kebab-case scope'),
  issue: z.number().int().positive(),
  text: translatedText,
});

const changelogFile = z.object({ entries: z.array(entry) }).strict();

const root = path.resolve(import.meta.dirname, '../..');
const files = process.argv.slice(2);
if (files.length === 0) files.push('changelog/unreleased.yaml');

let failed = false;
for (const file of files) {
  const raw = await readFile(path.resolve(root, file), 'utf8');
  const result = changelogFile.safeParse(parse(raw) ?? { entries: [] });
  if (result.success) {
    console.log(`${file}: ${result.data.entries.length} valid entries`);
    continue;
  }
  failed = true;
  console.error(`${file}: invalid\n${z.prettifyError(result.error)}`);
}
process.exit(failed ? 1 : 0);
