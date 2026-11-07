import 'server-only';

import { cache } from 'react';
import type { z } from 'zod';

import { logger } from '@/shared/lib/logger';
import { getSettings } from '@/features/settings/server/settings-store';

import { appearanceSettings } from '../appearance.settings';

export type Appearance = z.infer<typeof appearanceSettings.schema>;

/**
 * Instance appearance for this request. Without a database (first boot, outage) the defaults
 * apply: the shell must still render, if only to show an error.
 */
export const getAppearance = cache(async (): Promise<Appearance> => {
  if (!process.env.CANOPY_DATABASE_URL) return appearanceSettings.schema.parse({});
  try {
    return (await getSettings('appearance', appearanceSettings)).values;
  } catch (error) {
    logger.warn('appearance settings unavailable, defaults used', { module: 'appearance', error });
    return appearanceSettings.schema.parse({});
  }
});
