import { MonitorSmartphone } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

/**
 * Devices plugins find on the network (screens), kept so that people pick them by name.
 * Administrators name, hide, add and forget them; detection runs are audited by the engine.
 */
export const devicesModule = defineModule({
  id: 'devices',
  navigation: [
    {
      href: '/admin/devices',
      labelKey: 'devices',
      icon: MonitorSmartphone,
      group: 'administration',
      section: 'configuration',
      permission: 'system:admin',
    },
  ],
  auditActions: [
    'devices.add',
    'devices.update',
    'devices.forget',
    'devices.pair',
    'devices.default_set',
  ],
});
