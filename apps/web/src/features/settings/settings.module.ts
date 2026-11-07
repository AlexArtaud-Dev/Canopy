import { defineModule } from '@/shared/modules/module.types';

export const settingsModule = defineModule({
  id: 'settings',
  permissions: { scope: 'global', actions: ['read', 'update'] },
  auditActions: ['settings.update', 'settings.reset'],
});
