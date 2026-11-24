import { HardDrive } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

import { disksSettings } from './disks.settings';
import { diskReadPermission } from './disks.utils';

/**
 * Disk health (SMART). Reading it is the `metrics:disks` dashboard family; checking now and
 * self-tests are for administrators. Self-tests are audited as jobs (`jobs.start`).
 */
export const disksModule = defineModule({
  id: 'disks',
  settings: disksSettings,
  navigation: [
    {
      href: '/disks',
      labelKey: 'disks',
      icon: HardDrive,
      group: 'administration',
      section: 'monitoring',
      permission: diskReadPermission,
    },
  ],
  auditActions: ['disks.check'],
});
