import { defineConfig } from 'drizzle-kit';

// Schemas live next to their feature (`src/features/<domain>/server/*.schema.ts`).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.schema.ts',
  out: './drizzle',
  schemaFilter: ['auth', 'app', 'audit'],
  migrations: { schema: 'app', table: '__drizzle_migrations' },
  ...(process.env.CANOPY_DATABASE_URL
    ? { dbCredentials: { url: process.env.CANOPY_DATABASE_URL } }
    : {}),
});
