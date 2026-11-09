import { TerminalSquare } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { commandsSettings } from './commands.settings';

/**
 * Catalog commands: tools installed on the server, run with typed parameters, never free text.
 * `advanced` lets a person use advanced entries once the advanced mode setting is on.
 */
export const commandsModule = defineModule({
  id: 'commands',
  permissions: { scope: 'global', actions: ['advanced'] },
  settings: commandsSettings,
  navigation: [
    { href: '/commands', labelKey: 'commands', icon: TerminalSquare, group: 'workspace' },
  ],
  // Runs are audited by the engine (`jobs.start` with the entry).
  auditActions: [],
});
