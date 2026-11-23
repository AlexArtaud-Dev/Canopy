import { z } from 'zod';

import { locales } from '@/shared/i18n/locales';
import { colorThemes } from '@/shared/theme/color-themes';
import { surfaceStyles } from '@/shared/theme/surface-styles';
import { themeChoices } from '@/shared/theme/theme-choices';
import { defineSettings } from '@/shared/modules/settings.types';

export const appearanceSettings = defineSettings({
  schema: z.object({
    colorTheme: z.enum(colorThemes).default('canopy'),
    /** Frosted glass panes over a soft wallpaper, or opaque ones. */
    surfaceStyle: z.enum(surfaceStyles).default('glass'),
    /** Light/dark for people who have not picked one on their device. */
    defaultMode: z.enum(themeChoices).default('system'),
    /** Language when neither a saved choice nor the browser's languages match. */
    defaultLocale: z.enum(locales).default('en'),
  }),
  fields: {
    colorTheme: { group: 'theme' },
    surfaceStyle: { group: 'theme' },
    defaultMode: { group: 'theme' },
    defaultLocale: { group: 'language' },
  },
});
