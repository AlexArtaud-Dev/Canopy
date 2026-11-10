// Pure helpers turning the repository's docs/ tree into GitHub wiki pages. docs/ stays the source
// of truth (reviewed in pull requests); the wiki is a generated, read-friendly copy.

import { posix } from 'node:path';

/** Wiki sections, in sidebar order, by docs/ subfolder. */
export const sections = [
  { folder: 'user', label: 'User guide', prefix: '' },
  { folder: 'features', label: 'Features', prefix: '' },
  { folder: 'integrations', label: 'Plugins', prefix: '' },
  { folder: 'dev', label: 'Development', prefix: 'Dev ' },
];

/** The page title of a doc: its first `# ` heading, without a trailing `(…)` aside. */
export function titleOf(markdown, fallback) {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  const title = heading ? heading.slice(2) : fallback;
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** A wiki page name: letters, digits and dashes (GitHub shows dashes as spaces). */
export function pageName(title) {
  return title
    .replace(/&/g, 'and')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .join('-');
}

/**
 * Where a doc goes in the wiki, from its path relative to docs/. A section README is the
 * section's own page; files outside the sections (the roadmap) keep their title.
 */
export function placeDoc(relative, markdown) {
  const [folder, file] = relative.split('/');
  const section = sections.find((candidate) => candidate.folder === folder && file);
  const base = posix.basename(relative, '.md');
  if (section && base === 'README') {
    return { relative, section: section.folder, name: pageName(section.label) };
  }
  const title = titleOf(markdown, base);
  return {
    relative,
    section: section?.folder ?? null,
    name: pageName((section?.prefix ?? '') + title),
    title: (section?.prefix ?? '') + title,
  };
}

/** Fails when two docs would land on the same wiki page. */
export function assertUniqueNames(pages) {
  const seen = new Map();
  for (const page of pages) {
    const other = seen.get(page.name);
    if (other) throw new Error(`${page.relative} and ${other} both become wiki page ${page.name}`);
    seen.set(page.name, page.relative);
  }
}

/**
 * Rewrites relative links of one doc: other docs become wiki page links, images in docs/assets
 * become wiki `assets/` links, any other repository file a link to it on GitHub.
 */
export function rewriteLinks(markdown, relative, pagesByPath, repoUrl) {
  const dir = posix.dirname(relative);
  return markdown.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, bang, text, target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return whole;
    const [path, anchor] = target.split('#');
    const resolved = posix.normalize(posix.join(dir, path)).replace(/\/$/, '');
    const suffix = anchor === undefined ? '' : `#${anchor}`;
    const page = pagesByPath.get(resolved) ?? pagesByPath.get(`${resolved}/README.md`);
    if (page) return `${bang}[${text}](${page.name}${suffix})`;
    if (resolved.startsWith('assets/')) return `${bang}[${text}](${resolved}${suffix})`;
    const kind = path.endsWith('/') || !posix.extname(resolved) ? 'tree' : 'blob';
    const repoPath = posix.normalize(posix.join('docs', resolved));
    return `${bang}[${text}](${repoUrl}/${kind}/main/${repoPath}${suffix})`;
  });
}

/** The notice on every generated page: edits belong in the repository. */
export function sourceNotice(relative, repoUrl) {
  return `\n\n---\n\n_Generated from [\`docs/${relative}\`](${repoUrl}/blob/main/docs/${relative}). Edit it there: changes made in the wiki are overwritten._\n`;
}

function link(page) {
  return `[${page.name.replace(/-/g, ' ')}](${page.name})`;
}

/** The wiki sidebar: each section's pages, its README first, then by title. */
export function sidebar(pages) {
  const lines = ['**[Home](Home)**', ''];
  for (const section of sections) {
    const inSection = pages.filter((page) => page.section === section.folder);
    if (inSection.length === 0) continue;
    const ordered = [...inSection].sort(
      (a, b) =>
        Number(b.title === undefined) - Number(a.title === undefined) ||
        a.name.localeCompare(b.name),
    );
    lines.push(`**${section.label}**`, '', ...ordered.map((page) => `- ${link(page)}`), '');
  }
  const others = pages.filter((page) => page.section === null);
  if (others.length > 0) lines.push('**More**', '', ...others.map((page) => `- ${link(page)}`), '');
  return lines.join('\n');
}

/** The wiki's landing page. */
export function home(pages, repoUrl) {
  const guide = pages.find((page) => page.section === 'user' && page.title === undefined);
  const start = guide
    ? `Start with the ${link(guide)}: install, configuration, reverse proxy, upgrades and backups.`
    : '';
  return [
    '# Canopy',
    '',
    'A self-hosted web file manager, built from scratch as a successor to FileBrowser.',
    '',
    start,
    '',
    '- **Features**: what each part of Canopy does, one page per feature (see the sidebar).',
    '- **Plugins**: how to package a tool as a Canopy plugin.',
    '- **Development**: the rules contributors follow.',
    '',
    `Source code, issues and releases: [${repoUrl.replace('https://', '')}](${repoUrl}).`,
    '',
  ].join('\n');
}
