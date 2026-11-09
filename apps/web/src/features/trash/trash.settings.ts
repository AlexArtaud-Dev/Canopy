import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/**
 * Read by the engine's trash keeper (app.settings, module `trash`), per volume. Limits always
 * apply: the trash can never hold an unbounded amount of data or files.
 */
export const trashSettings = defineSettings({
  schema: z.object({
    /** Items older than this are deleted for good. */
    retentionDays: z.number().int().min(1).max(3650).default(30),
    /** Largest trash per volume, in MB; the oldest items go first beyond it. */
    maxSizeMb: z.number().int().min(1).max(10_000_000).default(10_240),
    /** Most files kept per volume; the oldest items go first beyond it. */
    maxFiles: z.number().int().min(1).max(10_000_000).default(10_000),
  }),
  fields: {
    retentionDays: { group: 'retention' },
    maxSizeMb: { group: 'limits' },
    maxFiles: { group: 'limits' },
  },
});
