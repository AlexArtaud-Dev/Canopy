import { SlidersHorizontal } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

export const settingsModule = defineModule({
  id: 'settings',
  permissions: { scope: 'global', actions: ['read', 'update'] },
  navigation: [
    {
      href: '/admin/settings',
      labelKey: 'settings',
      icon: SlidersHorizontal,
      group: 'administration',
      permission: 'settings:read',
    },
  ],
  auditActions: ['settings.update', 'settings.reset'],
});
