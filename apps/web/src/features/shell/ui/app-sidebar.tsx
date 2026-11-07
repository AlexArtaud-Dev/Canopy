'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';

import { appRegistry } from '@/modules';
import type { GlobalPermission } from '@/shared/modules/module.types';

import { isNavItemActive } from '../shell.nav';
import { BrandMark } from './brand-mark';

interface AppSidebarProps {
  footer: ReactNode;
  /** Permissions of the signed-in user; entries needing anything else are hidden (UX only). */
  grantedPermissions?: readonly GlobalPermission[];
}

export function AppSidebar({ footer, grantedPermissions }: AppSidebarProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  // Until authentication lands (M3/M4) there is no user, so every entry is shown.
  const navGroups = appRegistry.navigation(
    (permission) => grantedPermissions?.includes(permission) ?? true,
  );
  // On phones the sidebar is a sheet: close it once a destination is picked.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
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
              {group.items.map((item) => {
                const label = t(`nav.${item.labelKey}`);
                const active = isNavItemActive(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={closeOnMobile}
                      >
                        <item.icon aria-hidden />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
