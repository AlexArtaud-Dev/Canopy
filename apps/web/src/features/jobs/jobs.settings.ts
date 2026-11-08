import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/** Read by the engine (app.settings, module `jobs`); bounds mirror its own clamping. */
export const jobsSettings = defineSettings({
  schema: z.object({
    /** Jobs running at once on the engine; the rest wait in the queue. */
    maxConcurrent: z.number().int().min(1).max(32).default(4),
    /** Queued or running jobs one person may have before new ones are refused. */
    perUser: z.number().int().min(1).max(50).default(3),
  }),
  fields: {
    maxConcurrent: { group: 'limits', requiresRestart: true },
    perUser: { group: 'limits' },
  },
});
