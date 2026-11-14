import { defineModule } from '@/shared/modules/module.types';

/**
 * What happened for a person (a drop-off on their link…), shown by the bell in the header.
 * Features report events with `notify`; read marks are the person's own and not audited.
 */
export const notificationsModule = defineModule({
  id: 'notifications',
  auditActions: [],
});
