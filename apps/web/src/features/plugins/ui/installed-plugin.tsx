'use client';

import type { Plugin } from '@canopy/contracts';
import { ArrowUpCircle, ExternalLink, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';

import { localized } from '@/features/commands/commands.utils';

interface InstalledPluginProps {
  plugin: Plugin;
  /** Newer release version, when one is offered. */
  update: string | null;
  busy: boolean;
  onFlags: (flags: { enabled: boolean; pinned: boolean }) => void;
  onUpdate: () => void;
  onUninstall: () => void;
}

/** An installed plugin: what it brings, on/off, version pin, update and removal. */
export function InstalledPlugin({
  plugin,
  update,
  busy,
  onFlags,
  onUpdate,
  onUninstall,
}: InstalledPluginProps) {
  const t = useTranslations('plugins.installed');
  const format = useFormatter();
  const locale = useLocale();
  const name = localized(plugin.name, locale) || plugin.id;
  const enabledId = `plugin-${plugin.id}-enabled`;
  const pinnedId = `plugin-${plugin.id}-pinned`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {name}
          <Badge variant="secondary">v{plugin.version}</Badge>
          {!plugin.enabled && <Badge variant="outline">{t('disabled')}</Badge>}
          {update && (
            <Badge>
              <ArrowUpCircle aria-hidden />
              {t('updateBadge', { version: update })}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{localized(plugin.description, locale)}</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('uninstall', { name })}
            disabled={busy}
            onClick={onUninstall}
          >
            <Trash2 aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <a
          className="hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
          href={`https://github.com/${plugin.repo}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {plugin.repo}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <span>{t('commands', { count: plugin.commands })}</span>
        <span>
          {t('installedAt', {
            date: format.dateTime(new Date(plugin.installedAt), { dateStyle: 'medium' }),
          })}
        </span>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t">
        <div className="flex items-center gap-2">
          <Switch
            id={enabledId}
            checked={plugin.enabled}
            disabled={busy}
            onCheckedChange={(enabled) => {
              onFlags({ enabled, pinned: plugin.pinned });
            }}
          />
          <Label htmlFor={enabledId}>{t('enabled')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={pinnedId}
            checked={plugin.pinned}
            disabled={busy}
            onCheckedChange={(pinned) => {
              onFlags({ enabled: plugin.enabled, pinned });
            }}
          />
          <Label htmlFor={pinnedId}>{t('pinned')}</Label>
        </div>
        {update && (
          <Button className="ms-auto" size="sm" disabled={busy} onClick={onUpdate}>
            {busy ? <Spinner /> : <ArrowUpCircle aria-hidden />}
            {t('update', { version: update })}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
