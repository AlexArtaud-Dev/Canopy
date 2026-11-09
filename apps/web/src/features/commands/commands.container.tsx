'use client';

import { TerminalSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { CommandCatalog } from '@canopy/contracts';
import { cn } from 'cn';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';

import { localized } from './commands.utils';
import { CommandRunner } from './ui/command-runner';

/** Catalog commands: pick one, fill its form, read the exact arguments, run, watch the output. */
export function CommandsContainer({ catalog }: { catalog: CommandCatalog }) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(catalog.entries[0]?.id ?? null);
  const selected = catalog.entries.find((entry) => entry.id === selectedId);

  if (catalog.entries.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TerminalSquare aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {catalog.advanced ? t('emptyDescription') : t('emptyBasic')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <nav aria-label={t('catalog')} className="grid content-start gap-2">
        {catalog.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === selectedId}
            onClick={() => {
              setSelectedId(entry.id);
            }}
            className={cn(
              'hover:bg-muted/60 grid gap-1 rounded-lg border p-3 text-left text-sm',
              entry.id === selectedId && 'border-primary bg-accent',
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="min-w-0 flex-1 truncate">{localized(entry.name, locale)}</span>
              {entry.mode === 'advanced' && <Badge variant="outline">{t('advanced')}</Badge>}
            </span>
            <span className="text-muted-foreground line-clamp-2 text-xs">
              {localized(entry.description, locale)}
            </span>
          </button>
        ))}
      </nav>
      {selected && (
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{localized(selected.name, locale)}</CardTitle>
            <CardDescription>{localized(selected.description, locale)}</CardDescription>
          </CardHeader>
          <CardContent>
            <CommandRunner key={selected.id} entry={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
