'use client';

import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { localized } from '@/features/commands/commands.utils';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui/sidebar';

import { viewHref } from '../plugin-views.utils';
import { listPluginViews } from '../server/plugin-views-actions';
import { ViewIcon } from './view-look';

/** The views the person may open, shared by the sidebar and the header widgets. */
export function usePluginViews() {
  return useQuery({
    queryKey: ['plugin-views'],
    queryFn: async () => {
      const result = await listPluginViews();
      return result.ok ? result.data : [];
    },
    staleTime: 5 * 60_000,
  });
}

/** Plugin pages in the sidebar (Downloads…), only when some plugin brings one. */
export function PluginViewsNav() {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const views = usePluginViews().data ?? [];
  if (views.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('nav')}</SidebarGroupLabel>
      <SidebarMenu>
        {views.map(({ pluginId, view }) => {
          const href = viewHref(pluginId, view.id);
          const label = localized(view.name, locale);
          return (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                <Link
                  href={href as Route}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <ViewIcon name={view.icon} aria-hidden />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
