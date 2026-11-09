'use client';

import type { Plugin, PluginList } from '@canopy/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';

import { localized } from '@/features/commands/commands.utils';

import { sameRepo, updateAvailable, type RepoView } from './plugins.utils';
import {
  installPlugin,
  loadPlugins,
  loadReleases,
  uninstallPlugin,
  updatePlugin,
} from './server/plugins-actions';
import { AvailablePlugin } from './ui/available-plugin';
import { InstalledPlugin } from './ui/installed-plugin';

interface PluginsContainerProps {
  initial: PluginList;
}

/** Installed plugins and the releases of allowlisted repositories. */
export function PluginsContainer({ initial }: PluginsContainerProps) {
  const t = useTranslations('plugins.page');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Plugin | null>(null);

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

  const uninstall = async () => {
    if (!removing) return;
    const plugin = removing;
    await run(
      plugin.id,
      () => uninstallPlugin({ id: plugin.id }),
      () => t('uninstalled', { name: localized(plugin.name, locale) || plugin.id }),
    );
    setRemoving(null);
  };

  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-labelledby="plugins-installed">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="plugins-installed" className="text-base font-semibold">
            {t('installedTitle')}
          </h2>
          <Badge variant="outline" className="ms-auto font-mono">
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
                onFlags={(flags) => {
                  void run(plugin.id, () => updatePlugin({ id: plugin.id, ...flags }));
                }}
                onUpdate={() => {
                  void install(plugin.repo);
                }}
                onUninstall={() => {
                  setRemoving(plugin);
                }}
              />
            );
          })
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="plugins-available">
        <div className="grid gap-1">
          <h2 id="plugins-available" className="text-base font-semibold">
            {t('availableTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.rich('availableDescription', {
              settings: (chunks) => (
                <Link
                  className="text-foreground underline underline-offset-4"
                  href="/admin/settings"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
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

      <ConfirmDialog
        open={removing !== null}
        title={t('uninstallTitle')}
        description={t('uninstallDescription', {
          name: removing ? localized(removing.name, locale) || removing.id : '',
        })}
        confirmLabel={t('uninstallConfirm')}
        destructive
        pending={busy !== null && busy === removing?.id}
        onConfirm={() => void uninstall()}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />
    </div>
  );
}
