import { Users } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

export const usersModule = defineModule({
  id: 'users',
  permissions: { scope: 'global', actions: ['read', 'create', 'update', 'delete'] },
  navigation: [
    {
      href: '/admin/users',
      labelKey: 'users',
      icon: Users,
      group: 'administration',
      permission: 'users:read',
    },
  ],
  auditActions: [
    'users.create',
    'users.update',
    'users.disable',
    'users.enable',
    'users.delete',
    'users.password_reset',
    'users.sessions_revoke',
    'users.two_factor_reset',
    'users.invite',
    'users.reset_link',
    'users.data_export',
  ],
});
