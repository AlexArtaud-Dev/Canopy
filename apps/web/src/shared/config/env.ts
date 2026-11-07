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
  /** External URL users type in their browser; `https` turns on Secure cookies. */
  CANOPY_PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** CIDRs considered "local": first-run setup, maintenance toggle, local-only settings. */
  CANOPY_LOCAL_NETWORKS: z
    .string()
    .default('127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates bootstrap variables once at the boundary; callers get a typed, trusted object. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}
