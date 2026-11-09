import type { HighlighterCore, LanguageInput } from 'shiki/core';

// Each grammar is its own chunk, fetched the first time a file needs it.
const grammars: Readonly<Record<string, LanguageInput>> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  less: () => import('shiki/langs/less.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  dart: () => import('shiki/langs/dart.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  make: () => import('shiki/langs/make.mjs'),
};

/** Beyond this, highlighting would block the page for too long: the text is shown plain. */
export const highlightMaxChars = 100_000;

let highlighter: Promise<HighlighterCore> | null = null;

// The JavaScript regex engine: no WebAssembly, so the page CSP stays without 'wasm-unsafe-eval'.
function load(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
    ([core, engine]) =>
      core.createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
        langs: [],
        engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
      }),
  );
  return highlighter;
}

/**
 * Highlighted HTML for the code (shiki escapes the text), or null when the language is unknown.
 * Both themes are emitted as CSS variables; `globals.css` picks one with the app theme.
 */
export async function highlight(code: string, language: string): Promise<string | null> {
  const grammar = grammars[language];
  if (!grammar) return null;
  const instance = await load();
  if (!instance.getLoadedLanguages().includes(language)) await instance.loadLanguage(grammar);
  return instance.codeToHtml(code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}
