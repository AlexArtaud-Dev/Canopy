import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/** Read by the engine's thumbnail service (app.settings, module `thumbnails`). */
export const thumbnailsSettings = defineSettings({
  schema: z.object({
    /** Off: every file keeps its icon and the cache is emptied at the next sweep. */
    enabled: z.boolean().default(true),
    /** Largest thumbnail cache, in MB; the least recently used go first beyond it. */
    maxCacheMb: z.number().int().min(1).max(1_048_576).default(1024),
  }),
  fields: {
    enabled: { group: 'display' },
    maxCacheMb: { group: 'limits' },
  },
});
