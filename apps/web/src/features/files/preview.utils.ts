import type { PreviewKind } from '@canopy/contracts';

/** Text previews read at most this much: enough for any source file, cheap for huge logs. */
export const textPreviewBytes = 512 * 1024;

/** What the viewer needs to know about a listed file. */
export interface PreviewTarget {
  path: string;
  name: string;
  size: number;
  preview: PreviewKind;
  actions: readonly string[];
}

/** The engine names the viewer; seeing the content needs the right to download it. */
export function canPreview(entry: Pick<PreviewTarget, 'preview' | 'actions'>): boolean {
  return entry.preview !== 'none' && entry.actions.includes('download');
}

/** Previous and next previewable files around `path`, in listing order. */
export function previewNeighbours<T extends Pick<PreviewTarget, 'path' | 'preview' | 'actions'>>(
  entries: readonly T[],
  path: string,
): { previous: T | undefined; next: T | undefined } {
  const index = entries.findIndex((entry) => entry.path === path);
  if (index < 0) return { previous: undefined, next: undefined };
  return {
    previous: entries.slice(0, index).findLast(canPreview),
    next: entries.slice(index + 1).find(canPreview),
  };
}

// Highlighting grammars by extension (file name for extension-less files). Others stay plain.
const languages: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'jsonc',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  go: 'go',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  ps1: 'powershell',
  sql: 'sql',
  lua: 'lua',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
  dockerfile: 'docker',
  makefile: 'make',
};

/** The grammar for a file name, or null for plain text. */
export function codeLanguage(name: string): string | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const key = dot > 0 ? lower.slice(dot + 1) : lower;
  return languages[key] ?? null;
}

/** A NUL byte near the start means a binary file mislabelled as text: not worth rendering. */
const binaryProbeBytes = 8000;

export type DecodedText = { kind: 'text'; text: string } | { kind: 'binary' };

/** Decodes a text preview; a character cut at the end of a partial read becomes U+FFFD. */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes.subarray(0, binaryProbeBytes).includes(0)) return { kind: 'binary' };
  return { kind: 'text', text: new TextDecoder('utf-8').decode(bytes) };
}
