import { defineModule } from '@/shared/modules/module.types';

import { uploadsSettings } from './uploads.settings';

/** Resumable uploads (tus) received by the engine; permissions are the files module's path rules. */
export const uploadsModule = defineModule({
  id: 'uploads',
  settings: uploadsSettings,
  auditActions: [],
});
