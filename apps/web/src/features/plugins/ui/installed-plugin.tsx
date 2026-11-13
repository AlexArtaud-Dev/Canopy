'use client';

import type { Plugin } from '@canopy/contracts';
import { ArrowUpCircle, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';
import { Spinner } from '@/shared/ui/spinner';

import { localized } from '@/features/commands/commands.utils';

interface InstalledPluginProps {
  plugin: Plugin;
  /** Newer release version, when one is offered. */
  update: string | null;
  busy: boolean;
  onUpdate: () => void;
}

/** An installed plugin at a glance: what it is, its version, and the way to its settings. */
export function InstalledPlugin({ plugin, update, busy, onUpdate }: InstalledPluginProps) {
  const t = useTranslations('plugins.installed');
  const locale = useLocale();
  const name = localized(plugin.name, locale) || plugin.id;

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
      </CardHeader>
      <CardFooter className="flex flex-wrap items-center gap-3 border-t">
        <span className="text-muted-foreground text-sm">
          {t('commands', { count: plugin.commands })}
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          {update && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onUpdate}>
              {busy ? <Spinner /> : <ArrowUpCircle aria-hidden />}
              {t('update', { version: update })}
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/admin/plugins/${encodeURIComponent(plugin.id)}`}>
              <Settings2 aria-hidden />
              {t('configure')}
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
