import { FolderTree } from 'lucide-react';

import { defineModule } from '@/shared/modules/module.types';

/** Path-scoped actions granted per folder (see docs/dev/permissions.md). */
export const filesModule = defineModule({
  id: 'files',
  permissions: {
    scope: 'path',
    actions: [
      'read',
      'upload',
      'create',
      'update',
      'move',
      'copy',
      'delete',
      'download',
      'share',
      'execute',
    ],
  },
  navigation: [{ href: '/', labelKey: 'files', icon: FolderTree, group: 'workspace' }],
  auditActions: [],
});
