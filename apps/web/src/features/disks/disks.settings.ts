import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

/** Read by the engine's disks watcher (same keys and bounds; out-of-range values fall back). */
export const disksSettings = defineSettings({
  schema: z.object({
    /** Disks are read this often; sleeping disks are never woken up for it. */
    checkMinutes: z.number().int().min(5).max(1440).default(15),
    /** Spinning disks are too hot from this temperature (°C). */
    hddTemperatureLimit: z.number().int().min(30).max(90).default(55),
    /** SSDs and NVMe drives run warmer: their own limit (°C). */
    ssdTemperatureLimit: z.number().int().min(30).max(100).default(70),
  }),
  fields: {
    checkMinutes: { group: 'monitoring' },
    hddTemperatureLimit: { group: 'alerts' },
    ssdTemperatureLimit: { group: 'alerts' },
  },
});
