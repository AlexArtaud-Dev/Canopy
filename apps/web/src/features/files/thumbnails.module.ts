import { defineModule } from '@/shared/modules/module.types';

import { thumbnailsSettings } from './thumbnails.settings';

/** Image and video thumbnails, rendered and cached by the engine; access follows the files rules. */
export const thumbnailsModule = defineModule({
  id: 'thumbnails',
  settings: thumbnailsSettings,
  // Rendering changes nothing; setting changes are audited by the settings module.
  auditActions: [],
});
