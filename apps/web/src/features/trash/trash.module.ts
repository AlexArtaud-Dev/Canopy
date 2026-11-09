import { Trash2 } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { trashSettings } from './trash.settings';

/** Deleted items, kept per volume within limits; permissions are the files module's path rules. */
export const trashModule = defineModule({
  id: 'trash',
  settings: trashSettings,
  navigation: [{ href: '/trash', labelKey: 'trash', icon: Trash2, group: 'workspace' }],
  // Written by the engine.
  auditActions: ['trash.restore', 'trash.empty', 'trash.purge'],
});
