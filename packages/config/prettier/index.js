/** @type {import('prettier').Config} */
const config = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  // Keep hand-aligned code examples in docs readable.
  overrides: [{ files: '*.md', options: { embeddedLanguageFormatting: 'off' } }],
};

export default config;
