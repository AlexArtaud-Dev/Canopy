import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

export const auditSettings = defineSettings({
  schema: z.object({
    /** Events older than this are purged daily (the purge itself is audited). */
    retentionDays: z.number().int().min(30).max(3650).default(365),
  }),
  fields: {
    retentionDays: { group: 'retention', env: 'CANOPY_AUDIT_RETENTION_DAYS' },
  },
});
