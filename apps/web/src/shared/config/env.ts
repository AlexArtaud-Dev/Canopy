import { z } from 'zod';

const serverEnvSchema = z.object({
  CANOPY_ENGINE_URL: z.url().default('http://localhost:8080'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates bootstrap variables once at the boundary; callers get a typed, trusted object. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}
