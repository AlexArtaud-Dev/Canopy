import { Activity, FolderTree, type LucideIcon } from 'lucide-react';
import type { Route } from 'next';

export interface NavItem {
  href: Route;
  labelKey: 'files' | 'system';
  icon: LucideIcon;
}

export interface NavGroup {
  labelKey: 'workspace' | 'administration';
  items: readonly NavItem[];
}

export const navGroups: readonly NavGroup[] = [
  { labelKey: 'workspace', items: [{ href: '/', labelKey: 'files', icon: FolderTree }] },
  { labelKey: 'administration', items: [{ href: '/system', labelKey: 'system', icon: Activity }] },
];

/** Root only matches itself; other entries also match their sub-pages. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
