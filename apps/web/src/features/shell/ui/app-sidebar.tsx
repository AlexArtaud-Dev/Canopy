'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';

import { appRegistry } from '@/modules';
import type { GlobalPermission, NavEntry } from '@/shared/modules/module.types';
import type { NavNode } from '@/shared/modules/registry';

import { useClosedSections } from '../model/use-closed-sections';
import { isNavItemActive } from '../shell.nav';
import { BrandMark } from './brand-mark';

interface AppSidebarProps {
  footer: ReactNode;
  /** Permissions of the signed-in user; entries needing anything else are hidden (UX only). */
  grantedPermissions: readonly GlobalPermission[];
}

type SectionNode = Extract<NavNode, { kind: 'section' }>;

export function AppSidebar({ footer, grantedPermissions }: AppSidebarProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { closed, setOpen } = useClosedSections();
  const navGroups = appRegistry.navigation((permission) => grantedPermissions.includes(permission));
  const iconsOnly = state === 'collapsed' && !isMobile;
  // On phones the sidebar is a sheet: close it once a destination is picked.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const isActive = (entry: NavEntry) => isNavItemActive(entry.href, pathname);

  const entryLink = (entry: NavEntry) => {
    const label = t(`nav.${entry.labelKey}`);
    const active = isActive(entry);
    return (
      <SidebarMenuItem key={entry.href}>
        <SidebarMenuButton asChild isActive={active} tooltip={label}>
          <Link
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            onClick={closeOnMobile}
          >
            <entry.icon aria-hidden />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  /** Collapsed to icons: the section is an icon opening a menu of its pages. */
  const sectionMenu = (section: SectionNode, label: string, active: boolean) => (
    <SidebarMenuItem key={section.id}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={label}>
            <section.icon aria-hidden />
            <span>{label}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="min-w-48">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {section.entries.map((entry) => (
            <DropdownMenuItem key={entry.href} asChild>
              <Link href={entry.href} aria-current={isActive(entry) ? 'page' : undefined}>
                <entry.icon aria-hidden />
                {t(`nav.${entry.labelKey}`)}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );

  const sectionTree = (section: SectionNode) => {
    const label = t(`sections.${section.id}`);
    const active = section.entries.some(isActive);
    if (iconsOnly) return sectionMenu(section, label, active);
    // The section holding the current page always shows it.
    const open = active || !closed.has(section.id);
    return (
      <Collapsible
        key={section.id}
        asChild
        open={open}
        onOpenChange={(next) => {
          setOpen(section.id, next);
        }}
        className="group/section"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={label}>
              <section.icon aria-hidden />
              <span>{label}</span>
              <ChevronRight
                aria-hidden
                className="ms-auto transition-transform duration-200 group-data-[state=open]/section:rotate-90 rtl:rotate-180"
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {section.entries.map((entry) => {
                const entryActive = isActive(entry);
                return (
                  <SidebarMenuSubItem key={entry.href}>
                    <SidebarMenuSubButton asChild isActive={entryActive}>
                      <Link
                        href={entry.href}
                        aria-current={entryActive ? 'page' : undefined}
                        onClick={closeOnMobile}
                      >
                        <entry.icon aria-hidden />
                        <span>{t(`nav.${entry.labelKey}`)}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Canopy">
              <Link href="/" onClick={closeOnMobile}>
                <span className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <BrandMark className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold tracking-tight">Canopy</span>
                  <span className="text-muted-foreground truncate text-xs">{t('tagline')}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{t(`groups.${group.id}`)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.nodes.map((node) =>
                node.kind === 'entry' ? entryLink(node.entry) : sectionTree(node),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
