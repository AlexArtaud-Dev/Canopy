import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

export const pluginsSettings = defineSettings({
  schema: z.object({
    /**
     * GitHub repositories (`owner/name`, separated by commas or spaces) plugins may be installed
     * from. Nothing else can be installed.
     */
    allowedRepos: z.string().max(2000).default('AlexArtaud-Dev/mrename'),
  }),
  fields: {
    allowedRepos: { group: 'sources' },
  },
});
