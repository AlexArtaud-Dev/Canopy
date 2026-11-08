import { defineModule } from '@/shared/modules/module.types';

import { jobsSettings } from './jobs.settings';

/** Background operations run by the engine; the engine writes these audit events. */
export const jobsModule = defineModule({
  id: 'jobs',
  settings: jobsSettings,
  auditActions: ['jobs.start', 'jobs.cancel'],
});
