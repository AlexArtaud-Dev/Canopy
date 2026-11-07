import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.yaml',
  output: { path: './gen/ts', postProcess: ['prettier'] },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    'zod',
    { name: '@hey-api/sdk', validator: 'zod' },
  ],
});
