import { Puzzle } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { pluginsSettings } from './plugins.settings';

/** Third-party tools adding catalog commands, installed from allowlisted GitHub releases. */
export const pluginsModule = defineModule({
  id: 'plugins',
  settings: pluginsSettings,
  navigation: [
    {
      href: '/admin/plugins',
      labelKey: 'plugins',
      icon: Puzzle,
      group: 'administration',
      section: 'configuration',
      permission: 'system:admin',
    },
  ],
  // Written by the engine, which checks and applies every change.
  auditActions: ['plugins.install', 'plugins.update', 'plugins.uninstall'],
});
