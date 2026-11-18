import { LayoutDashboard } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

/**
 * Personal dashboards: each person arranges their own, nobody sees anyone else's. The values come
 * from the variables their roles let them read (`metrics` module).
 */
export const dashboardsModule = defineModule({
  id: 'dashboards',
  navigation: [
    { href: '/dashboards', labelKey: 'dashboards', icon: LayoutDashboard, group: 'workspace' },
  ],
  auditActions: ['dashboards.create', 'dashboards.update', 'dashboards.delete', 'dashboards.home'],
});
