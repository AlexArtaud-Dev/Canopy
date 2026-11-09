// Preloaded with `node --import` first: secrets written by the setup step (CANOPY_*_FILE) become
// ordinary variables before anything reads process.env. A missing file stops the start loudly.
import { readFileSync } from 'node:fs';

import { resolveSecretFiles } from './secret-files.utils.mjs';

Object.assign(
  process.env,
  resolveSecretFiles(process.env, (path) => readFileSync(path, 'utf8')),
);
