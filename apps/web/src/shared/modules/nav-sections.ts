import { Activity, SlidersHorizontal, UsersRound, type LucideIcon } from 'lucide-react';

import type { NavGroupId, NavSectionId } from './module.types';

export interface NavSectionDefinition {
  id: NavSectionId;
  group: NavGroupId;
  icon: LucideIcon;
}

/** Sidebar sections, in display order; modules place their entries in one by id. */
export const navSections: readonly NavSectionDefinition[] = [
  { id: 'people', group: 'administration', icon: UsersRound },
  { id: 'configuration', group: 'administration', icon: SlidersHorizontal },
  { id: 'monitoring', group: 'administration', icon: Activity },
];
