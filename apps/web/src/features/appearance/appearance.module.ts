import { defineModule } from '@/shared/modules/module.types';

import { appearanceSettings } from './appearance.settings';

export const appearanceModule = defineModule({
  id: 'appearance',
  settings: appearanceSettings,
  auditActions: [],
});
