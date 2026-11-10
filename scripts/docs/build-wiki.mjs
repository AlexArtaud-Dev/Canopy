// Builds the GitHub wiki from docs/: `node scripts/docs/build-wiki.mjs <wiki checkout>`.
// Every generated page is rewritten; pages no longer in docs/ are removed. Run by the wiki
// workflow on each merge to main.

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

import {
  assertUniqueNames,
  home,
  placeDoc,
  rewriteLinks,
  sidebar,
  sourceNotice,
} from './wiki.lib.mjs';

const docsDir = 'docs';
const out = process.argv[2];
const repoUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? 'AlexArtaud-Dev/Canopy'}`;
if (!out) {
  console.error('usage: build-wiki.mjs <wiki checkout>');
  process.exit(2);
}

async function markdownFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'assets') found.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

const files = await markdownFiles(docsDir);
const docs = await Promise.all(
  files.map(async (file) => {
    const rel = relative(docsDir, file).split(sep).join(posix.sep);
    const markdown = await readFile(file, 'utf8');
    return { markdown, page: placeDoc(rel, markdown) };
  }),
);
const pages = docs.map((doc) => doc.page).sort((a, b) => a.relative.localeCompare(b.relative));
assertUniqueNames(pages);
const byPath = new Map(pages.map((page) => [page.relative, page]));

// The wiki only holds generated pages: start from a clean slate (git history keeps the rest).
for (const entry of await readdir(out)) {
  if (entry !== '.git') await rm(join(out, entry), { recursive: true, force: true });
}
for (const { markdown, page } of docs) {
  const body = rewriteLinks(markdown, page.relative, byPath, repoUrl);
  await writeFile(
    join(out, `${page.name}.md`),
    body.trimEnd() + sourceNotice(page.relative, repoUrl),
  );
}
await writeFile(join(out, 'Home.md'), home(pages, repoUrl));
await writeFile(join(out, '_Sidebar.md'), sidebar(pages));
await mkdir(join(out, 'assets'), { recursive: true });
await cp(join(docsDir, 'assets'), join(out, 'assets'), { recursive: true });
console.log(`${pages.length} pages written to ${out}`);
