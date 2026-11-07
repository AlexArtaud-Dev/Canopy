import { Activity, FolderTree } from 'lucide-react';

import { defineModule, type CanopyModule } from './module.types';
import { createRegistry } from './registry';

const files = defineModule({
  id: 'files',
  permissions: { scope: 'path', actions: ['read', 'upload'] },
  navigation: [{ href: '/', labelKey: 'files', icon: FolderTree, group: 'workspace' }],
  auditActions: ['files.upload'],
});

const system = defineModule({
  id: 'system',
  permissions: { scope: 'global', actions: ['read', 'admin'] },
  navigation: [
    {
      href: '/system',
      labelKey: 'system',
      icon: Activity,
      group: 'administration',
      permission: 'system:read',
    },
  ],
  auditActions: ['system.maintenance_toggle'],
});

const quiet: CanopyModule = { id: 'quiet', auditActions: [] };

describe('createRegistry', () => {
  const registry = createRegistry([files, system, quiet]);

  it('collects global permissions as <module>:<action>', () => {
    expect(registry.globalPermissions).toEqual(['system:read', 'system:admin']);
  });

  it('collects path permissions per module', () => {
    expect(registry.pathPermissions.get('files')).toEqual(['read', 'upload']);
    expect(registry.pathPermissions.has('system')).toBe(false);
  });

  it('collects audit actions', () => {
    expect([...registry.auditActions]).toEqual(['files.upload', 'system.maintenance_toggle']);
  });

  it('groups navigation in display order and filters by permission', () => {
    const all = registry.navigation(() => true);
    expect(all.map((group) => [group.id, group.items.map((item) => item.href)])).toEqual([
      ['workspace', ['/']],
      ['administration', ['/system']],
    ]);
    const restricted = registry.navigation(() => false);
    expect(restricted.map((group) => group.id)).toEqual(['workspace']);
  });
});

describe('createRegistry validation', () => {
  const base = { auditActions: [] as string[] };

  it.each([
    ['an invalid id', [{ ...base, id: 'Files' }], /invalid module id/],
    ['a duplicate id', [files, { ...base, id: 'files' }], /duplicate module/],
    [
      'a duplicate action',
      [{ ...base, id: 'x', permissions: { scope: 'global', actions: ['read', 'read'] } }],
      /declares a permission twice/,
    ],
    [
      'an invalid action',
      [{ ...base, id: 'x', permissions: { scope: 'global', actions: ['Read'] } }],
      /invalid action/,
    ],
    ['a foreign audit action', [{ id: 'x', auditActions: ['y.delete'] }], /must be "x.<action>"/],
    [
      'a duplicate href',
      [files, { ...base, id: 'other', navigation: files.navigation }],
      /duplicate navigation href/,
    ],
    [
      'an undeclared nav permission',
      [
        {
          ...base,
          id: 'x',
          navigation: [
            {
              href: '/system',
              labelKey: 'system',
              icon: Activity,
              group: 'administration',
              permission: 'x:read',
            },
          ],
        },
      ],
      /undeclared "x:read"/,
    ],
  ] satisfies [string, CanopyModule[], RegExp][])('rejects %s', (_label, modules, message) => {
    expect(() => createRegistry(modules)).toThrow(message);
  });
});
