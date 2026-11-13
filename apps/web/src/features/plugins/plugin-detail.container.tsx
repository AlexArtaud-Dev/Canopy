'use client';

import type { CommandEntry, Plugin } from '@canopy/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, ExternalLink, TerminalSquare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Label } from '@/shared/ui/label';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';
import { localized } from '@/features/commands/commands.utils';
import { DevicesContainer, type Device, type KindView } from '@/features/devices';

import { sameRepo, updateAvailable } from './plugins.utils';
import { savableFields, type PluginSavedValues } from './saved-values.utils';
import {
  installPlugin,
  loadPlugins,
  loadReleases,
  uninstallPlugin,
  updatePlugin,
} from './server/plugins-actions';
import { loadSavedValues, removeSavedValue, saveValue } from './server/saved-values-actions';
import { FieldDefaults } from './ui/field-defaults';

interface PluginDetailProps {
  initial: Plugin;
  /** The commands the plugin brings (the catalog, filtered). */
  commands: readonly CommandEntry[];
  /** The kinds of devices it finds, and the devices kept for them. */
  kinds: readonly KindView[];
  devices: readonly Device[];
  saved: PluginSavedValues;
}

/**
 * One installed plugin, everything about it in one place: what its forms start with, the
 * devices it finds, the commands it brings, then its version, state and removal.
 */
export function PluginDetailContainer(props: PluginDetailProps) {
  const t = useTranslations('plugins.detail');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const id = props.initial.id;

  const { data: plugin } = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const result = await loadPlugins();
      return result.ok ? result.data : null;
    },
    select: (list) => list?.items.find((item) => item.id === id) ?? props.initial,
  });
  const current = plugin ?? props.initial;
  const releases = useQuery({
    queryKey: ['plugins', 'releases'],
    queryFn: async () => {
      const result = await loadReleases();
      if (!result.ok) throw new Error(result.error.code);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
  const { data: saved } = useQuery({
    queryKey: ['plugins', 'saved-values'],
    queryFn: async () => {
      const result = await loadSavedValues();
      return result.ok ? result.data : {};
    },
    select: (all) => all[id] ?? {},
    initialData: { [id]: props.saved },
  });

  const latest = releases.data?.find((source) => sameRepo(source.repo, current.repo))?.release
    ?.version;
  const update = latest && updateAvailable(current.version, latest, current.pinned) ? latest : null;
  const name = localized(current.name, locale) || id;
  const fields = savableFields(props.commands, id);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['plugins'], exact: true });
    void queryClient.invalidateQueries({ queryKey: ['commands'] });
  };
  const act = async (
    action: () => Promise<{ ok: true } | { ok: false; error: { code: string } }>,
    done?: string,
  ): Promise<boolean> => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code));
      return false;
    }
    await refresh();
    if (done) toast.success(done);
    return true;
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{name}</h1>
          <Badge variant="secondary">v{current.version}</Badge>
          {!current.enabled && <Badge variant="outline">{t('disabled')}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">{localized(current.description, locale)}</p>
        <a
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
          href={`https://github.com/${current.repo}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {current.repo}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </header>

      {update && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle aria-hidden className="text-primary size-5" />
              {t('updateTitle', { version: update })}
            </CardTitle>
            <CardDescription>{t('updateDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              disabled={busy}
              onClick={() =>
                void act(
                  () => installPlugin({ repo: current.repo }),
                  t('updated', { name, version: update }),
                )
              }
            >
              {busy ? <Spinner aria-hidden /> : <ArrowUpCircle aria-hidden />}
              {t('update', { version: update })}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('defaultsTitle')}</CardTitle>
          <CardDescription>{t('defaultsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldDefaults
            fields={fields}
            saved={saved}
            onAdd={async (field, label, value) => {
              const result = await saveValue({ plugin: id, field, label, value });
              if (!result.ok) return errorMessage(result.error.code);
              queryClient.setQueryData(['plugins', 'saved-values'], result.data);
              return null;
            }}
            onRemove={async (field, value) => {
              const result = await removeSavedValue({ plugin: id, field, value });
              if (!result.ok) {
                toast.error(errorMessage(result.error.code));
                return;
              }
              queryClient.setQueryData(['plugins', 'saved-values'], result.data);
            }}
          />
        </CardContent>
      </Card>

      {props.kinds.length > 0 && (
        <section className="grid gap-3" aria-labelledby="plugin-devices">
          <div className="grid gap-1">
            <h2 id="plugin-devices" className="text-base font-semibold">
              {t('devicesTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('devicesDescription')}</p>
          </div>
          <DevicesContainer kinds={props.kinds} initial={props.devices} />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('commandsTitle', { count: props.commands.length })}</CardTitle>
          <CardDescription>{t('commandsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {props.commands.map((command) => (
              <li key={command.id}>
                <Link
                  href={`/commands?command=${encodeURIComponent(command.id)}`}
                  className="hover:bg-muted/60 flex items-start gap-3 p-3 text-sm"
                >
                  <TerminalSquare aria-hidden className="text-muted-foreground mt-0.5 size-4" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      {localized(command.name, locale)}
                      {command.secondary === true && (
                        <Badge variant="outline">{t('secondary')}</Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {localized(command.description, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('stateTitle')}</CardTitle>
          <CardDescription>
            {t('installedAt', {
              date: format.dateTime(new Date(current.installedAt), { dateStyle: 'medium' }),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ToggleRow
            id={`${id}-enabled`}
            label={t('enabled')}
            help={t('enabledHelp')}
            checked={current.enabled}
            disabled={busy}
            onChange={(enabled) =>
              void act(() => updatePlugin({ id, enabled, pinned: current.pinned }))
            }
          />
          <ToggleRow
            id={`${id}-pinned`}
            label={t('pinned')}
            help={t('pinnedHelp')}
            checked={current.pinned}
            disabled={busy}
            onChange={(pinned) =>
              void act(() => updatePlugin({ id, enabled: current.enabled, pinned }))
            }
          />
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <p className="text-muted-foreground min-w-0 flex-1 text-sm">{t('uninstallHelp')}</p>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setRemoving(true);
              }}
            >
              <Trash2 aria-hidden />
              {t('uninstall')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removing}
        title={t('uninstallTitle')}
        description={t('uninstallDescription', { name })}
        confirmLabel={t('uninstall')}
        destructive
        pending={busy}
        onConfirm={() =>
          void act(() => uninstallPlugin({ id }), t('uninstalled', { name })).then((done) => {
            setRemoving(false);
            if (done) router.push('/admin/plugins');
          })
        }
        onOpenChange={setRemoving}
      />
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, help, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-sm">{help}</p>
      </div>
    </div>
  );
}
