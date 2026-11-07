import { defineModule } from '@/shared/modules/module.types';

export const auditModule = defineModule({
  id: 'audit',
  permissions: { scope: 'global', actions: ['read', 'export'] },
  auditActions: ['audit.export', 'audit.purge'],
});
