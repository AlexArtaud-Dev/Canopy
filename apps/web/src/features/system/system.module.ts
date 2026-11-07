import { Activity } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

export const systemModule = defineModule({
  id: 'system',
  permissions: {
    scope: 'global',
    // `admin` bypasses path grants (still audited); `read` shows service health.
    actions: ['read', 'admin'],
  },
  navigation: [
    {
      href: '/system',
      labelKey: 'system',
      icon: Activity,
      group: 'administration',
      permission: 'system:read',
    },
  ],
  auditActions: [],
});
