'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { PluginView, PluginViewAction } from '@canopy/contracts';
import { localized } from '@/features/commands/commands.utils';
import { formatBytes } from '@/features/files/browser.utils';
import { cn } from '@/shared/lib/utils';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader } from '@/shared/ui/empty';
import { Progress } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  actionApplies,
  formatEta,
  parseViewData,
  type ViewRef,
  type ViewRow,
  type ViewSummary,
} from './plugin-views.utils';
import { readPluginViewData, runPluginViewAction } from './server/plugin-views-actions';
import { InputDialog } from './ui/input-dialog';
import { toneClass, ViewIcon } from './ui/view-look';

/** What the person picked in the current section: groups (packages) and items (links). */
interface Chosen {
  groups: string[];
  items: string[];
}

const nothing: Chosen = { groups: [], items: [] };

/** The query key of a view's data (shared with the header widget). */
export function viewQueryKey(pluginId: string, viewId: string) {
  return ['plugin-view', pluginId, viewId] as const;
}

/** Reads a view's data; a refusal throws its translated message. */
export function useViewData(ref: ViewRef, refreshSeconds: number) {
  const errorMessage = useErrorMessage();
  return useQuery({
    queryKey: viewQueryKey(ref.pluginId, ref.view.id),
    queryFn: async () => {
      const result = await readPluginViewData({ plugin: ref.pluginId, view: ref.view.id });
      if (!result.ok) throw new Error(errorMessage(result.error.code, result.error.params));
      return parseViewData(result.data, ref.view);
    },
    refetchInterval: refreshSeconds * 1000,
    refetchIntervalInBackground: false,
  });
}

/** A plugin's live page: its summary and actions, then one tab per section of rows. */
export function PluginViewContainer({ viewRef }: { viewRef: ViewRef }) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const { view } = viewRef;
  const data = useViewData(viewRef, view.refreshSeconds);
  const [section, setSection] = useState(view.sections[0]?.key ?? '');
  const [chosen, setChosen] = useState<Chosen>(nothing);

  const changeSection = (key: string) => {
    setSection(key);
    setChosen(nothing);
  };

  return (
    <div className="grid gap-4">
      <SummaryCard
        viewRef={viewRef}
        summary={data.data?.summary ?? null}
        loading={data.isPending}
      />
      {data.isError && (
        <Alert variant="destructive">
          <AlertDescription>{data.error.message}</AlertDescription>
        </Alert>
      )}
      <Tabs value={section} onValueChange={changeSection}>
        <TabsList>
          {view.sections.map((candidate) => (
            <TabsTrigger key={candidate.key} value={candidate.key}>
              {localized(candidate.name, locale)}
              {data.data && (
                <Badge variant="secondary" className="ml-1.5">
                  {data.data.sections[candidate.key]?.length ?? 0}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {view.sections.map((candidate) => (
          <TabsContent key={candidate.key} value={candidate.key} className="grid gap-3">
            <RowActions
              viewRef={viewRef}
              actions={view.actions.filter(
                (action) => action.on === 'row' && candidate.rowActions.includes(action.id),
              )}
              chosen={chosen}
              onDone={() => {
                setChosen(nothing);
              }}
            />
            {data.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (data.data?.sections[candidate.key]?.length ?? 0) === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyDescription>
                    {candidate.empty ? localized(candidate.empty, locale) : t('empty')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <RowsTable
                view={view}
                rows={data.data?.sections[candidate.key] ?? []}
                chosen={chosen}
                selectable={candidate.rowActions.length > 0}
                onChange={setChosen}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-muted-foreground text-xs">
        {t('refresh', { seconds: view.refreshSeconds })}
      </p>
    </div>
  );
}

function stateLabel(view: PluginView, state: string | null, locale: string) {
  const declared = view.states.find((candidate) => candidate.key === state);
  return {
    label: declared ? localized(declared.label, locale) : (state ?? ''),
    tone: declared?.tone,
  };
}

function SummaryCard({
  viewRef,
  summary,
  loading,
}: {
  viewRef: ViewRef;
  summary: ViewSummary | null;
  loading: boolean;
}) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const { view } = viewRef;
  const state = summary ? stateLabel(view, summary.state, locale) : null;
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {loading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <>
              {state?.label && (
                <Badge className={cn('border-transparent', toneClass(state.tone))}>
                  {state.label}
                </Badge>
              )}
              {summary?.speed !== null && summary?.speed !== undefined && (
                <span className="text-sm font-medium tabular-nums">
                  {t('speed', { speed: formatBytes(summary.speed, locale) })}
                </span>
              )}
              {summary?.bytesTotal ? (
                <span className="text-muted-foreground text-sm tabular-nums">
                  {t('size', {
                    loaded: formatBytes(summary.bytesLoaded ?? 0, locale),
                    total: formatBytes(summary.bytesTotal, locale),
                  })}
                </span>
              ) : null}
              {summary?.eta !== null && summary?.eta !== undefined && (
                <span className="text-muted-foreground text-sm tabular-nums">
                  {t('eta', { eta: formatEta(summary.eta) })}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <ViewActions viewRef={viewRef} />
          </div>
        </div>
        {summary?.progress !== null && summary?.progress !== undefined && (
          <Progress value={summary.progress * 100} aria-label={t('progress')} />
        )}
      </CardContent>
    </Card>
  );
}

/** Runs an action, asking for its text or a confirmation first when it needs one. */
function useActionRunner(viewRef: ViewRef, onDone: () => void) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<{ action: PluginViewAction; chosen: Chosen } | null>(null);

  const run = (action: PluginViewAction, chosen: Chosen, input?: string) => {
    startTransition(async () => {
      const result = await runPluginViewAction({
        plugin: viewRef.pluginId,
        view: viewRef.view.id,
        action: action.id,
        groups: chosen.groups,
        items: chosen.items,
        ...(input === undefined ? {} : { input }),
      });
      setAsking(null);
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      toast.success(t('started', { action: localized(action.name, locale) }));
      onDone();
      // The plugin applies it in a moment: read the view again soon.
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: viewQueryKey(viewRef.pluginId, viewRef.view.id),
        });
      }, 1500);
    });
  };

  const start = (action: PluginViewAction, chosen: Chosen) => {
    if (action.input || action.confirm) setAsking({ action, chosen });
    else run(action, chosen);
  };

  const dialogs = asking && (
    <>
      {asking.action.input ? (
        <InputDialog
          title={localized(asking.action.name, locale)}
          pending={pending}
          onSubmit={(input) => {
            run(asking.action, asking.chosen, input);
          }}
          onClose={() => {
            setAsking(null);
          }}
        />
      ) : (
        <ConfirmDialog
          open
          destructive
          title={localized(asking.action.name, locale)}
          description={t('confirm', {
            count: asking.chosen.groups.length + asking.chosen.items.length,
          })}
          confirmLabel={localized(asking.action.name, locale)}
          pending={pending}
          onConfirm={() => {
            run(asking.action, asking.chosen);
          }}
          onOpenChange={(open) => {
            if (!open) setAsking(null);
          }}
        />
      )}
    </>
  );
  return { start, pending, dialogs };
}

function ViewActions({ viewRef }: { viewRef: ViewRef }) {
  const locale = useLocale();
  const runner = useActionRunner(viewRef, () => undefined);
  return (
    <>
      {viewRef.view.actions
        .filter((action) => action.on === 'view')
        .map((action) => {
          return (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              disabled={runner.pending}
              onClick={() => {
                runner.start(action, nothing);
              }}
            >
              <ViewIcon name={action.icon} aria-hidden data-icon="inline-start" />
              {localized(action.name, locale)}
            </Button>
          );
        })}
      {runner.dialogs}
    </>
  );
}

function RowActions({
  viewRef,
  actions,
  chosen,
  onDone,
}: {
  viewRef: ViewRef;
  actions: readonly PluginViewAction[];
  chosen: Chosen;
  onDone: () => void;
}) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const runner = useActionRunner(viewRef, onDone);
  const count = chosen.groups.length + chosen.items.length;
  if (count === 0 || actions.length === 0) return runner.dialogs ?? null;
  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">{t('chosen', { count })}</span>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {actions.map((action) => {
          return (
            <Button
              key={action.id}
              variant={action.confirm ? 'destructive' : 'outline'}
              size="sm"
              disabled={runner.pending || !actionApplies(action, chosen)}
              onClick={() => {
                runner.start(action, chosen);
              }}
            >
              <ViewIcon name={action.icon} aria-hidden data-icon="inline-start" />
              {localized(action.name, locale)}
            </Button>
          );
        })}
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t('clear')}
        </Button>
      </div>
      {runner.dialogs}
    </div>
  );
}

function toggle(list: readonly string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...list, id])] : list.filter((candidate) => candidate !== id);
}

function RowsTable({
  view,
  rows,
  chosen,
  selectable,
  onChange,
}: {
  view: PluginView;
  rows: readonly ViewRow[];
  chosen: Chosen;
  selectable: boolean;
  onChange: (chosen: Chosen) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo(() => new Set(chosen.groups), [chosen.groups]);
  const items = useMemo(() => new Set(chosen.items), [chosen.items]);
  return (
    <div className="divide-y rounded-lg border">
      {rows.map((row) => {
        const expanded = open.has(row.id);
        return (
          <Fragment key={row.id}>
            <RowLine
              view={view}
              row={row}
              depth={0}
              expandable={row.items.length > 0}
              expanded={expanded}
              selectable={selectable}
              selected={groups.has(row.id)}
              onExpand={() => {
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(row.id)) next.delete(row.id);
                  else next.add(row.id);
                  return next;
                });
              }}
              onSelect={(on) => {
                onChange({ ...chosen, groups: toggle(chosen.groups, row.id, on) });
              }}
            />
            {expanded &&
              row.items.map((item) => (
                <RowLine
                  key={item.id}
                  view={view}
                  row={item}
                  depth={1}
                  expandable={false}
                  expanded={false}
                  selectable={selectable}
                  selected={items.has(item.id)}
                  onExpand={() => undefined}
                  onSelect={(on) => {
                    onChange({ ...chosen, items: toggle(chosen.items, item.id, on) });
                  }}
                />
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}

function RowLine({
  view,
  row,
  depth,
  expandable,
  expanded,
  selectable,
  selected,
  onExpand,
  onSelect,
}: {
  view: PluginView;
  row: ViewRow;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  selectable: boolean;
  selected: boolean;
  onExpand: () => void;
  onSelect: (on: boolean) => void;
}) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const state = stateLabel(view, row.state, locale);
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_10rem_auto]',
        depth > 0 && 'bg-muted/30 pl-10',
        !row.enabled && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1">
        {selectable && (
          <Checkbox
            checked={selected}
            aria-label={t('choose', { name: row.name })}
            onCheckedChange={(checked) => {
              onSelect(checked === true);
            }}
          />
        )}
        {expandable ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={
              expanded ? t('collapse', { name: row.name }) : t('expand', { name: row.name })
            }
            onClick={onExpand}
          >
            <ChevronRight
              aria-hidden
              className={cn('transition-transform', expanded && 'rotate-90')}
            />
          </Button>
        ) : (
          depth === 0 && <span className="w-7" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={row.name}>
          {row.name}
        </p>
        <p className="text-muted-foreground truncate text-xs" title={row.detail ?? undefined}>
          {[row.status, row.bytesTotal ? formatBytes(row.bytesTotal, locale) : null, row.detail]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="col-span-2 grid gap-1 sm:col-span-1">
        {row.progress !== null && (
          <>
            <Progress value={row.progress * 100} aria-label={t('progress')} />
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.round(row.progress * 100)} %
              {row.speed ? ` · ${t('speed', { speed: formatBytes(row.speed, locale) })}` : ''}
              {row.eta !== null && row.speed ? ` · ${formatEta(row.eta)}` : ''}
            </span>
          </>
        )}
      </div>
      <div className="col-span-2 justify-self-start sm:col-span-1 sm:justify-self-end">
        {state.label && (
          <Badge className={cn('border-transparent', toneClass(state.tone))}>{state.label}</Badge>
        )}
      </div>
    </div>
  );
}
