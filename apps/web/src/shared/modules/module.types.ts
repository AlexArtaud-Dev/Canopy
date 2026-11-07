import type { LucideIcon } from 'lucide-react';
import type { Route } from 'next';

import type shellMessages from '../../../messages/en/shell.json';

export type ModuleId = string;

/** `<module>:<action>`, e.g. `users:create`. */
export type GlobalPermission = `${ModuleId}:${string}`;

export interface PermissionManifest<TAction extends string = string> {
  scope: 'global' | 'path';
  actions: readonly TAction[];
}

// English messages are the source of truth for which labels exist.
export type NavGroupId = keyof (typeof shellMessages)['groups'];
export type NavLabelKey = keyof (typeof shellMessages)['nav'];

export interface NavEntry {
  href: Route;
  /** Key under `shell.nav` in the messages. */
  labelKey: NavLabelKey;
  icon: LucideIcon;
  group: NavGroupId;
  /** Global permission required to see the entry (UX only; pages enforce it server-side). */
  permission?: GlobalPermission;
}

/**
 * Every feature declares itself once. Registering it wires its permissions (admin matrix), its
 * navigation entries and its audit action labels — no hand-written screen per module.
 * Module files must stay client-safe: they are imported by the navigation.
 */
export interface CanopyModule {
  id: ModuleId;
  permissions?: PermissionManifest;
  navigation?: readonly NavEntry[];
  /** `<module>.<action>` names this module writes to the audit log. */
  auditActions: readonly string[];
}

export function defineModule<const T extends CanopyModule>(module: T): T {
  return module;
}
