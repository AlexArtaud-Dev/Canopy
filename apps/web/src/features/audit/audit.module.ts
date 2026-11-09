import { ScrollText } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { auditSettings } from './audit.settings';

export const auditModule = defineModule({
  id: 'audit',
  permissions: { scope: 'global', actions: ['read', 'export'] },
  settings: auditSettings,
  navigation: [
    {
      href: '/admin/audit',
      labelKey: 'audit',
      icon: ScrollText,
      group: 'administration',
      section: 'monitoring',
      permission: 'audit:read',
    },
  ],
  auditActions: ['audit.export', 'audit.purge'],
});
