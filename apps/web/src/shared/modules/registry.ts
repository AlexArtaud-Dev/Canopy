import type { LucideIcon } from 'lucide-react';

import type {
  CanopyModule,
  GlobalPermission,
  NavEntry,
  NavGroupId,
  NavSectionId,
  PermissionManifest,
} from './module.types';
import { navSections as declaredSections, type NavSectionDefinition } from './nav-sections';

/** A sidebar row: a page, or a collapsible section holding pages. */
export type NavNode =
  | { kind: 'entry'; entry: NavEntry }
  | { kind: 'section'; id: NavSectionId; icon: LucideIcon; entries: readonly NavEntry[] };

export interface NavGroup {
  id: NavGroupId;
  /** Entries outside any section first, then sections in their declared order. */
  nodes: readonly NavNode[];
}

export interface ModuleRegistry {
  modules: readonly CanopyModule[];
  /** Every global permission declared by a module, `<module>:<action>`. */
  globalPermissions: readonly GlobalPermission[];
  /** Path-scoped actions per module (only `files` today). */
  pathPermissions: ReadonlyMap<string, readonly string[]>;
  auditActions: ReadonlySet<string>;
  /** Navigation grouped in display order, filtered by what the viewer may see. */
  navigation: (can: (permission: GlobalPermission) => boolean) => readonly NavGroup[];
}

const groupOrder: readonly NavGroupId[] = ['workspace', 'administration'];
const moduleIdPattern = /^[a-z][a-z0-9-]*$/;
const actionPattern = /^[a-z][a-z0-9_]*$/;

function fail(message: string): never {
  throw new Error(`module registry: ${message}`);
}

function checkPermissions(id: string, permissions: PermissionManifest | undefined): void {
  const actions = permissions?.actions ?? [];
  if (new Set(actions).size !== actions.length) fail(`${id} declares a permission twice`);
  const invalid = actions.find((action) => !actionPattern.test(action));
  if (invalid !== undefined) fail(`${id} has an invalid action "${invalid}"`);
}

function checkAuditActions(id: string, actions: readonly string[]): void {
  const foreign = actions.find((action) => !new RegExp(`^${id}\\.[a-z][a-z0-9_]*$`).test(action));
  if (foreign !== undefined) fail(`${id} audit action "${foreign}" must be "${id}.<action>"`);
}

function checkSection(entry: NavEntry, sections: readonly NavSectionDefinition[]): void {
  if (entry.section === undefined) return;
  const section = sections.find((candidate) => candidate.id === entry.section);
  if (section?.group !== entry.group) {
    fail(`navigation "${entry.href}" names section "${entry.section}" outside its group`);
  }
}

/** Validates module declarations once at startup; a broken declaration fails loudly. */
export function createRegistry(
  modules: readonly CanopyModule[],
  sections: readonly NavSectionDefinition[] = declaredSections,
): ModuleRegistry {
  const ids = new Set<string>();
  const hrefs = new Set<string>();
  for (const declared of modules) {
    if (!moduleIdPattern.test(declared.id)) fail(`invalid module id "${declared.id}"`);
    if (ids.has(declared.id)) fail(`duplicate module "${declared.id}"`);
    ids.add(declared.id);
    checkPermissions(declared.id, declared.permissions);
    checkAuditActions(declared.id, declared.auditActions);
    for (const entry of declared.navigation ?? []) {
      if (hrefs.has(entry.href)) fail(`duplicate navigation href "${entry.href}"`);
      hrefs.add(entry.href);
      checkSection(entry, sections);
    }
  }

  const globalPermissions = modules.flatMap((declared) =>
    declared.permissions?.scope === 'global'
      ? declared.permissions.actions.map((action): GlobalPermission => `${declared.id}:${action}`)
      : [],
  );
  const pathPermissions = new Map(
    modules.flatMap((declared) =>
      declared.permissions?.scope === 'path'
        ? [[declared.id, declared.permissions.actions] as const]
        : [],
    ),
  );
  const declaredPermissions = new Set<string>(globalPermissions);
  const entries = modules.flatMap((declared) => declared.navigation ?? []);
  const undeclared = entries.find(
    (entry) => entry.permission !== undefined && !declaredPermissions.has(entry.permission),
  );
  if (undeclared)
    fail(`navigation "${undeclared.href}" needs undeclared "${String(undeclared.permission)}"`);

  return {
    modules,
    globalPermissions,
    pathPermissions,
    auditActions: new Set(modules.flatMap((declared) => declared.auditActions)),
    navigation: (can) => {
      const visible = entries.filter(
        (entry) => entry.permission === undefined || can(entry.permission),
      );
      return groupOrder
        .map((id): NavGroup => {
          const loose = visible
            .filter((entry) => entry.group === id && entry.section === undefined)
            .map((entry): NavNode => ({ kind: 'entry', entry }));
          const grouped = sections
            .filter((section) => section.group === id)
            .map((section): NavNode => ({
              kind: 'section',
              id: section.id,
              icon: section.icon,
              entries: visible.filter((entry) => entry.section === section.id),
            }))
            .filter((node) => node.kind === 'section' && node.entries.length > 0);
          return { id, nodes: [...loose, ...grouped] };
        })
        .filter((group) => group.nodes.length > 0);
    },
  };
}
