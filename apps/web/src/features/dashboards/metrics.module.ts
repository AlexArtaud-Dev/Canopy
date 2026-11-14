import { defineModule } from '@/shared/modules/module.types';

import { variableFamilies } from './variables.utils';

/**
 * Dashboard variables: one permission per family (`metrics:system`…), granted in the roles editor.
 * Reads are not audited (they change nothing); refused reads are, as `metrics.read_denied`.
 */
export const metricsModule = defineModule({
  id: 'metrics',
  permissions: { scope: 'global', actions: variableFamilies },
  auditActions: ['metrics.read_denied'],
});
