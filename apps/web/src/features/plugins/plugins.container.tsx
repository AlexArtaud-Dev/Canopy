'use client';

import type { Plugin, PluginList } from '@canopy/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { localized } from '@/features/commands/commands.utils';

import { sameRepo, updateAvailable, type RepoView } from './plugins.utils';
import {
  addSource,
  installPlugin,
  loadPlugins,
  loadReleases,
  removeSource,
} from './server/plugins-actions';
import { AvailablePlugin } from './ui/available-plugin';
import { InstalledPlugin } from './ui/installed-plugin';
import { PluginSources } from './ui/plugin-sources';

interface PluginsContainerProps {
  initial: PluginList;
}

/**
 * Installed plugins, each leading to its own settings page; and, apart, the repositories plugins
 * come from with what they offer to install.
 */
export function PluginsContainer({ initial }: PluginsContainerProps) {
  const t = useTranslations('plugins.page');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const result = await loadPlugins();
      return result.ok ? result.data : initial;
    },
    initialData: initial,
  });
  // GitHub is slow compared to the engine: releases arrive after the page is usable.
  const releases = useQuery({
    queryKey: ['plugins', 'releases'],
    queryFn: async () => {
      const result = await loadReleases();
      if (!result.ok) throw new Error(result.error.code);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });

  const sourceOf = (plugin: Plugin): RepoView | undefined =>
    releases.data?.find((source) => sameRepo(source.repo, plugin.repo));
  const available = (releases.data ?? []).filter(
    (source) => !list.items.some((plugin) => sameRepo(plugin.repo, source.repo)),
  );

  const run = async <T,>(
    key: string,
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: { code: string } }>,
    success?: (data: T) => string,
  ) => {
    setBusy(key);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['plugins'], exact: true });
    // Installing, updating or removing a plugin changes the commands on offer.
    void queryClient.invalidateQueries({ queryKey: ['commands'] });
    if (success) toast.success(success(result.data));
  };

  const install = (repo: string) =>
    run(
      repo,
      () => installPlugin({ repo }),
      (plugin) =>
        t('installed', {
          name: localized(plugin.name, locale) || plugin.id,
          version: plugin.version,
        }),
    );

  const addRepo = async (repo: string): Promise<string | null> => {
    const result = await addSource({ repo });
    if (!result.ok) return errorMessage(result.error.code);
    await queryClient.invalidateQueries({ queryKey: ['plugins', 'releases'] });
    toast.success(t('sourceAdded', { repo: result.data.repo }));
    return null;
  };

  const removeRepo = async (repo: string) => {
    const result = await removeSource({ repo });
    if (!result.ok) {
      toast.error(errorMessage(result.error.code));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['plugins', 'releases'] });
    toast.success(t('sourceRemoved', { repo }));
  };

  return (
    <Tabs defaultValue="installed" className="gap-4">
      <TabsList>
        <TabsTrigger value="installed">
          {t('installedTab')}
          <Badge variant="secondary">{list.items.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="add">{t('addTab')}</TabsTrigger>
      </TabsList>

      <TabsContent value="installed" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground min-w-0 flex-1 text-sm">
            {t('installedDescription')}
          </p>
          <Badge variant="outline" className="font-mono">
            {t('platform', { platform: list.platform })}
          </Badge>
        </div>
        {list.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          list.items.map((plugin) => {
            const latest = sourceOf(plugin)?.release?.version;
            return (
              <InstalledPlugin
                key={plugin.id}
                plugin={plugin}
                update={
                  latest && updateAvailable(plugin.version, latest, plugin.pinned) ? latest : null
                }
                busy={busy === plugin.id || busy === plugin.repo}
                onUpdate={() => {
                  void install(plugin.repo);
                }}
              />
            );
          })
        )}
      </TabsContent>

      <TabsContent value="add" className="grid gap-8">
        <section className="grid gap-3" aria-labelledby="plugins-available">
          <div className="grid gap-1">
            <h2 id="plugins-available" className="text-base font-semibold">
              {t('availableTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('availableDescription')}</p>
          </div>
          {releases.isPending && <Skeleton className="h-16 w-full" />}
          {releases.isError && (
            <p className="text-destructive text-sm">{errorMessage(releases.error.message)}</p>
          )}
          {releases.isSuccess &&
            (available.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                {t('nothingAvailable')}
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {available.map((source) => (
                  <AvailablePlugin
                    key={source.repo}
                    source={source}
                    busy={busy === source.repo}
                    onInstall={() => {
                      void install(source.repo);
                    }}
                  />
                ))}
              </ul>
            ))}
        </section>

        <PluginSources
          sources={releases.isError ? [] : releases.data}
          errorMessage={errorMessage}
          onAdd={addRepo}
          onRemove={removeRepo}
        />
      </TabsContent>
    </Tabs>
  );
}
