import { z } from 'zod';

const serverEnvSchema = z.object({
  CANOPY_ENGINE_URL: z.url().default('http://localhost:8080'),
  CANOPY_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL')
    .optional(),
  /** Comma-separated CIDRs allowed to set forwarded headers; empty = trust no proxy. */
  CANOPY_TRUSTED_PROXIES: z.string().default(''),
  /** base64 32-byte key for secrets at rest (`openssl rand -base64 32`). */
  CANOPY_ENCRYPTION_KEY: z.string().optional(),
  /** Retired keys, comma-separated, still accepted for decryption during a rotation. */
  CANOPY_ENCRYPTION_KEY_PREVIOUS: z.string().default(''),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates bootstrap variables once at the boundary; callers get a typed, trusted object. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}
