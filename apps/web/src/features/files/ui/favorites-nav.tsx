'use client';

import { Star, X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui/sidebar';

import { browserHref } from '../browser.utils';
import { cleanVirtualPath } from '../files.utils';
import { useFavorites } from '../model/use-favorites';

const noopSubscribe = () => () => undefined;

/** The sidebar's Favorites: one click to a pinned folder, unavailable ones kept but inert. */
export function FavoritesNav() {
  const t = useTranslations('files.favorites');
  const { favorites: loaded, toggle } = useFavorites();
  // The page may load favorites before this boundary hydrates: render them only on the client,
  // so the first client render matches the server's empty list.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const favorites = hydrated ? loaded : [];
  const { isMobile, setOpenMobile, state } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname === '/' ? cleanVirtualPath(searchParams.get('path') ?? '/') : null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('title')}</SidebarGroupLabel>
      <SidebarMenu>
        {hydrated && favorites.length === 0 && state === 'expanded' && (
          <li className="text-muted-foreground px-2 text-xs">{t('empty')}</li>
        )}
        {favorites.map((favorite) => {
          const active = favorite.path === current;
          const label = favorite.available
            ? favorite.name
            : t('unavailable', { name: favorite.name });
          return (
            <SidebarMenuItem key={favorite.path}>
              {favorite.available ? (
                <SidebarMenuButton asChild isActive={active} tooltip={favorite.path}>
                  <Link
                    href={
                      browserHref({
                        path: favorite.path,
                        sort: 'name',
                        order: 'asc',
                        q: '',
                      }) as Route
                    }
                    aria-current={active ? 'page' : undefined}
                    title={favorite.path}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <Star aria-hidden className="fill-primary/20 text-primary" />
                    <span>{favorite.name}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  aria-disabled
                  tooltip={label}
                  className="text-muted-foreground cursor-default opacity-70"
                >
                  <Star aria-hidden />
                  <span title={label}>{favorite.name}</span>
                </SidebarMenuButton>
              )}
              <SidebarMenuAction
                showOnHover
                aria-label={t('remove', { name: favorite.name })}
                onClick={() => {
                  void toggle(favorite.path);
                }}
              >
                <X aria-hidden />
              </SidebarMenuAction>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
