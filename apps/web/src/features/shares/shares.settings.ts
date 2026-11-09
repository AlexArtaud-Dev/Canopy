import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

export const sharesSettings = defineSettings({
  schema: z.object({
    /** Preselected when creating a link. */
    defaultExpiryDays: z.number().int().min(1).max(3650).default(7),
    /** Longest validity anyone may choose: no link lives forever. */
    maxExpiryDays: z.number().int().min(1).max(3650).default(90),
    /** Every new link must have a password. */
    requirePassword: z.boolean().default(false),
  }),
  fields: {
    defaultExpiryDays: { group: 'links' },
    maxExpiryDays: { group: 'links' },
    requirePassword: { group: 'links' },
  },
});
