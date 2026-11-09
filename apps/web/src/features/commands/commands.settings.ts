import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/** Read by the engine (app.settings, module `commands`). */
export const commandsSettings = defineSettings({
  schema: z.object({
    /** Off: only basic catalog commands are offered. */
    advancedMode: z.boolean().default(false),
  }),
  fields: {
    advancedMode: { group: 'advanced' },
  },
});
