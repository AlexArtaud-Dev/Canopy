'use client';

import { ArrowLeft, ChevronRight, History, Puzzle, Search, TerminalSquare } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import type { CommandCatalog, CommandEntry } from '@canopy/contracts';
import { cn } from 'cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';

import { commandGroups, localized, recentEntries } from './commands.utils';
import { useRecentCommands } from './model/use-recent-commands';
import { CommandRunner } from './ui/command-runner';

/** The query parameter naming the command shown, so that a link opens it. */
const commandParam = 'command';

/**
 * Catalog commands grouped by plugin, searchable, the latest run on top; pick one, fill its form,
 * run, watch the output. On a phone the list and the form take the screen in turn.
 */
export function CommandsContainer({ catalog }: { catalog: CommandCatalog }) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const linked = searchParams.get(commandParam);
  const { recent } = useRecentCommands();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(
    () => commandGroups(catalog.entries, deferredQuery),
    [catalog.entries, deferredQuery],
  );
  const recents = useMemo(
    () => (deferredQuery.trim() === '' ? recentEntries(recent, catalog.entries) : []),
    [recent, catalog.entries, deferredQuery],
  );
  const [chosenId, setChosenId] = useState<string | null>(linked);
  // A phone shows the form once a command is picked; wide screens show both side by side.
  const [formShown, setFormShown] = useState(linked !== null);
  const known = chosenId !== null && catalog.entries.some((entry) => entry.id === chosenId);
  const selectedId =
    (known ? chosenId : null) ?? recents[0]?.id ?? groups[0]?.entries[0]?.id ?? null;
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

  const select = (id: string) => {
    setChosenId(id);
    setFormShown(true);
    const url = new URL(window.location.href);
    url.searchParams.set(commandParam, id);
    window.history.replaceState(null, '', url);
  };
  const searching = deferredQuery.trim() !== '';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
      <nav
        aria-label={t('catalog')}
        className={cn(
          'grid content-start gap-3 lg:sticky lg:top-4',
          formShown && selected && 'max-lg:hidden',
        )}
      >
        <div className="relative">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
        {recents.length > 0 && (
          <EntryGroup
            title={t('recent')}
            icon={<History aria-hidden />}
            entries={recents}
            selectedId={selectedId}
            onSelect={select}
            forcedOpen={false}
          />
        )}
        {groups.map((group) => (
          <EntryGroup
            key={group.id}
            title={group.plugin ? localized(group.plugin.name, locale) : t('builtIn')}
            icon={group.plugin ? <Puzzle aria-hidden /> : <TerminalSquare aria-hidden />}
            entries={group.entries}
            selectedId={selectedId}
            onSelect={select}
            forcedOpen={searching}
          />
        ))}
        {groups.length === 0 && (
          <p role="status" className="text-muted-foreground px-1 text-sm">
            {t('searchNone')}
          </p>
        )}
      </nav>
      {selected && (
        <div className={cn('grid gap-3', !formShown && 'max-lg:hidden')}>
          <Button
            type="button"
            variant="ghost"
            className="justify-self-start lg:hidden"
            onClick={() => {
              setFormShown(false);
            }}
          >
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t('allCommands')}
          </Button>
          <SelectedCommand entry={selected} />
        </div>
      )}
    </div>
  );
}

interface EntryGroupProps {
  title: string;
  icon: React.ReactNode;
  entries: readonly CommandEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Open whatever the person chose: what a search finds must be seen. */
  forcedOpen: boolean;
}

/** A foldable group of commands: a plugin's, the built-in ones, or the latest run. */
function EntryGroup({ title, icon, entries, selectedId, onSelect, forcedOpen }: EntryGroupProps) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={forcedOpen || open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="hover:bg-muted/60 group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium [&_svg]:size-4"
        disabled={forcedOpen}
      >
        <ChevronRight
          aria-hidden
          className="text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
        />
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <Badge variant="secondary" aria-label={t('count', { count: entries.length })}>
          {entries.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 grid gap-1">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={entry.id === selectedId ? 'true' : undefined}
            onClick={() => {
              onSelect(entry.id);
            }}
            className={cn(
              'hover:bg-muted/60 grid gap-0.5 rounded-md border border-transparent px-3 py-2 text-left text-sm',
              entry.id === selectedId && 'border-primary bg-accent',
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="min-w-0 flex-1 truncate">{localized(entry.name, locale)}</span>
              {entry.mode === 'advanced' && <Badge variant="outline">{t('advanced')}</Badge>}
            </span>
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {localized(entry.description, locale)}
            </span>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The picked command: what it does, its form, its run. */
function SelectedCommand({ entry }: { entry: CommandEntry }) {
  const locale = useLocale();
  return (
    <Card className="content-start">
      <CardHeader>
        {entry.plugin && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Puzzle aria-hidden className="size-3.5" />
            {localized(entry.plugin.name, locale)}
          </p>
        )}
        <CardTitle>{localized(entry.name, locale)}</CardTitle>
        <CardDescription>{localized(entry.description, locale)}</CardDescription>
      </CardHeader>
      <CardContent>
        <CommandRunner key={entry.id} entry={entry} />
      </CardContent>
    </Card>
  );
}
