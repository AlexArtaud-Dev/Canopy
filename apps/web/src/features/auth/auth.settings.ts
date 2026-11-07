import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

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
  }),
  fields: {
    sessionLifetimeDays: { group: 'sessions' },
    idleTimeoutMinutes: { group: 'sessions' },
  },
});
