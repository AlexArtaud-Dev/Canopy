import { Mail } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { mailSettings } from './mail.settings';

export const mailModule = defineModule({
  id: 'mail',
  permissions: { scope: 'global', actions: ['read', 'update'] },
  settings: mailSettings,
  navigation: [
    {
      href: '/admin/email',
      labelKey: 'email',
      icon: Mail,
      group: 'administration',
      section: 'configuration',
      permission: 'mail:read',
    },
  ],
  auditActions: ['mail.test_send'],
});
