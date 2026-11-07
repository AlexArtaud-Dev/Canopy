import { defineModule } from '@/shared/modules/module.types';

const crud = ['read', 'create', 'update', 'delete'] as const;

export const usersModule = defineModule({
  id: 'users',
  permissions: { scope: 'global', actions: crud },
  auditActions: [],
});

export const groupsModule = defineModule({
  id: 'groups',
  permissions: { scope: 'global', actions: crud },
  auditActions: [],
});

export const rolesModule = defineModule({
  id: 'roles',
  permissions: { scope: 'global', actions: crud },
  auditActions: [],
});
