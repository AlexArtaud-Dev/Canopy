import { pgSchema } from 'drizzle-orm/pg-core';

// Postgres schemas owned by the web role (created by docker/postgres/init). Feature tables are
// declared in `features/<domain>/server/*.schema.ts` against these.
export const authSchema = pgSchema('auth');
export const appSchema = pgSchema('app');
export const auditSchema = pgSchema('audit');
