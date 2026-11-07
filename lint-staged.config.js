// Manual pre-commit helper (`pnpm exec lint-staged`); intentionally not wired to a git hook.
export default {
  '*.{js,mjs,cjs,ts,tsx,json,md,yaml,yml,css}': 'prettier --write',
  '*.go': 'gofumpt -w',
};
