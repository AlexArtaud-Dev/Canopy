import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

export const systemSettings = defineSettings({
  schema: z.object({
    /** Lockdown: only the local network reaches Canopy; everyone else sees the maintenance page. */
    maintenance: z.boolean().default(false),
  }),
  fields: {
    // Local-only: an administrator outside the network could otherwise lock themselves out.
    maintenance: { group: 'maintenance', localOnly: true, env: 'CANOPY_MAINTENANCE' },
  },
});
