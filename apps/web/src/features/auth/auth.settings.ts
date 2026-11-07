import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

import { defaultPasswordMinLength } from './auth.utils';

export const authSettings = defineSettings({
  schema: z.object({
    /** Hard cap: a session ends this long after sign-in, active or not. */
    sessionLifetimeDays: z.number().int().min(1).max(365).default(30),
    /** A session unused for this long ends. */
    idleTimeoutMinutes: z
      .number()
      .int()
      .min(15)
      .max(60 * 24 * 365)
      .default(60 * 24 * 7),
    passwordMinLength: z.number().int().min(8).max(128).default(defaultPasswordMinLength),
    /** Failed sign-ins on one account before it is locked. */
    lockoutThreshold: z.number().int().min(3).max(100).default(5),
    lockoutMinutes: z.number().int().min(1).max(1440).default(15),
    /**
     * Reject passwords found in public breaches (Have I Been Pwned, k-anonymity: only the first
     * 5 hex chars of the SHA-1 leave the server). Off by default: it calls an external service.
     */
    checkBreachedPasswords: z.boolean().default(false),
  }),
  fields: {
    sessionLifetimeDays: { group: 'sessions' },
    idleTimeoutMinutes: { group: 'sessions' },
    passwordMinLength: { group: 'passwords' },
    lockoutThreshold: { group: 'protection' },
    lockoutMinutes: { group: 'protection' },
    checkBreachedPasswords: { group: 'passwords' },
  },
});
