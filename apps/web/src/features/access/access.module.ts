import { KeyRound, UsersRound } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

const crud = ['read', 'create', 'update', 'delete'] as const;

export const groupsModule = defineModule({
  id: 'groups',
  permissions: { scope: 'global', actions: crud },
  navigation: [
    {
      href: '/admin/groups',
      labelKey: 'groups',
      icon: UsersRound,
      group: 'administration',
      permission: 'groups:read',
    },
  ],
  auditActions: [
    'groups.create',
    'groups.update',
    'groups.delete',
    'groups.members_add',
    'groups.members_remove',
  ],
});

export const rolesModule = defineModule({
  id: 'roles',
  permissions: { scope: 'global', actions: crud },
  navigation: [
    {
      href: '/admin/roles',
      labelKey: 'roles',
      icon: KeyRound,
      group: 'administration',
      permission: 'roles:read',
    },
  ],
  auditActions: ['roles.create', 'roles.update', 'roles.delete'],
});
