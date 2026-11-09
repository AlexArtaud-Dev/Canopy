import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/** Read by the engine (app.settings, module `uploads`) when each upload starts. */
export const uploadsSettings = defineSettings({
  schema: z.object({
    /** Largest file accepted, in MB; 0 means no limit. */
    maxFileSizeMb: z.number().int().min(0).max(10_000_000).default(0),
    /** Extensions refused, e.g. "exe, bat" (empty: everything accepted). */
    blockedExtensions: z.string().trim().max(500).default(''),
  }),
  fields: {
    maxFileSizeMb: { group: 'limits' },
    blockedExtensions: { group: 'limits' },
  },
});
