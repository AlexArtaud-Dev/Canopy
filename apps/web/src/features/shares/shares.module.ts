import { Link2 } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { sharesSettings } from './shares.settings';

/**
 * Share links. Creating one needs the `share` path action on the item (engine grants); `manage`
 * lets administrators see and revoke everyone's links.
 */
export const sharesModule = defineModule({
  id: 'shares',
  permissions: { scope: 'global', actions: ['manage'] },
  settings: sharesSettings,
  navigation: [{ href: '/shares', labelKey: 'shares', icon: Link2, group: 'workspace' }],
  auditActions: [
    'shares.create',
    'shares.revoke',
    'shares.open',
    'shares.unlock_failed',
    'shares.download',
  ],
});
