'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';

import type { Favorite } from '../favorites.utils';
import { addFavorite, listFavorites, removeFavorite } from '../server/favorites';

export const favoritesQueryKey = ['favorites'] as const;

async function fetchFavorites(): Promise<Favorite[]> {
  const result = await listFavorites();
  // A failed refresh shows none rather than an error in the sidebar.
  return result.ok ? result.data : [];
}

/** The signed-in person's favorite folders, shared by the sidebar, menus and folder picker. */
export function useFavorites() {
  const t = useTranslations('files.favorites');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: favoritesQueryKey,
    queryFn: fetchFavorites,
    staleTime: 60_000,
  });
  const favorites = useMemo(() => query.data ?? [], [query.data]);
  const pinned = useMemo(() => new Set(favorites.map((favorite) => favorite.path)), [favorites]);

  const toggle = async (path: string) => {
    const removing = pinned.has(path);
    const result = await (removing ? removeFavorite : addFavorite)({ path });
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    toast.success(removing ? t('removed') : t('added'));
    await queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
  };

  return {
    favorites,
    isFavorite: (path: string) => pinned.has(path),
    toggle,
  };
}
