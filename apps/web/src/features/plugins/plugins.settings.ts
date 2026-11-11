import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

import { savedValuesSchema } from './saved-values.utils';

export const pluginsSettings = defineSettings({
  schema: z.object({
    /**
     * GitHub repositories (`owner/name`, separated by commas or spaces) plugins may be installed
     * from. Nothing else can be installed.
     */
    allowedRepos: z.string().max(2000).default('AlexArtaud-Dev/mrename'),
    /**
     * Values administrators saved for plugin fields (see `saved-values.utils.ts`): forms
     * offer them by name. Edited on the Plugins page, never by hand.
     */
    savedValues: savedValuesSchema.default({}),
  }),
  fields: {
    allowedRepos: { group: 'sources' },
    savedValues: { group: 'sources' },
  },
});
