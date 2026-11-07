import { baseConfig } from '@canopy/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  ...baseConfig,
  // shadcn primitives are vendored as generated; we lint our code, not theirs.
  { ignores: ['src/shared/ui/**'] },
];

export default config;
