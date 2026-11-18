'use client';

import { useQuery } from '@tanstack/react-query';
import { HardDrive, Star, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/ui/chart';
import { Skeleton } from '@/shared/ui/skeleton';
import { listFavorites } from '@/features/files/server/favorites';
import { listFolder } from '@/features/files/server/browse';

import { formatValue, type Panel } from '../dashboards.utils';
import { useVariableData, type VariableState } from '../model/use-variable-data';
import { latestValue, type TimeRange, type VariableData } from '../variables.utils';

interface PanelViewProps {
  panel: Panel;
  range: TimeRange;
  refreshSeconds: number;
}

/** What a panel shows, by its type. */
export function PanelView(props: PanelViewProps) {
  switch (props.panel.type) {
    case 'folders':
      return <FoldersView />;
    case 'stat':
      return <VariableView {...props} render={(data) => <StatView data={data} />} />;
    case 'line':
      return (
        <VariableView {...props} render={(data) => <LineView data={data} range={props.range} />} />
      );
    case 'log':
      return <VariableView {...props} render={(data) => <LogView data={data} />} />;
  }
}

/** Loads the panel's first variable and draws it, or says why it cannot. */
function VariableView({
  panel,
  range,
  refreshSeconds,
  render,
}: PanelViewProps & { render: (data: VariableData) => React.ReactNode }) {
  const state = useVariableData(panel.variables[0] ?? '', range, refreshSeconds);
  return <StateView state={state} render={render} />;
}

function StateView({
  state,
  render,
}: {
  state: VariableState;
  render: (data: VariableData) => React.ReactNode;
}) {
  const t = useTranslations('dashboards.panel');
  const errorMessage = useErrorMessage();
  if (state.status === 'loading') {
    return <Skeleton className="size-full min-h-16" aria-label={t('loading')} />;
  }
  if (state.status === 'error') {
    return (
      <p className="text-muted-foreground text-sm">
        {state.code === 'metrics.forbidden' ? t('unreadable') : errorMessage(state.code)}
      </p>
    );
  }
  return render(state.data);
}

function StatView({ data }: { data: VariableData }) {
  const t = useTranslations('dashboards.panel');
  const locale = useLocale();
  const value = latestValue(data);
  if (value === null || data.kind !== 'series') {
    return <p className="text-muted-foreground text-sm">{t('noData')}</p>;
  }
  return (
    <p className="text-3xl font-semibold tracking-tight tabular-nums">
      {formatValue(value, data.unit, locale)}
    </p>
  );
}

/** Theme colours for up to five series (more reuse them). */
const seriesColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function LineView({ data, range }: { data: VariableData; range: TimeRange }) {
  const t = useTranslations('dashboards.panel');
  const locale = useLocale();
  const format = useFormatter();
  if (data.kind !== 'series' || data.series.every((series) => series.points.length === 0)) {
    return <p className="text-muted-foreground text-sm">{t('noData')}</p>;
  }
  // One row per instant, one column per series: the shape Recharts draws lines from.
  const rows = new Map<string, Record<string, number | string>>();
  const keys = data.series.map((_, index) => `s${String(index)}`);
  data.series.forEach((series, index) => {
    for (const point of series.points) {
      const row = rows.get(point.at) ?? { at: point.at };
      row[keys[index] ?? 's'] = point.avg;
      rows.set(point.at, row);
    }
  });
  const config: ChartConfig = Object.fromEntries(
    data.series.map((series, index) => [
      keys[index] ?? 's',
      {
        label: series.name || '—',
        color: seriesColors[index % seriesColors.length] ?? 'var(--chart-1)',
      },
    ]),
  );
  const short = range === '1h' || range === '6h' || range === '24h';
  const tick = (at: string) =>
    format.dateTime(
      new Date(at),
      short ? { timeStyle: 'short' } : { day: 'numeric', month: 'short' },
    );
  return (
    <ChartContainer config={config} className="size-full min-h-32">
      <LineChart data={[...rows.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)))}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="at"
          tickFormatter={tick}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatValue(value, data.unit, locale)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const row: unknown = payload[0]?.payload;
                const at = typeof row === 'object' && row !== null && 'at' in row ? row.at : null;
                return typeof at === 'string'
                  ? format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' })
                  : '';
              }}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">{config[String(name)]?.label}</span>
                  <span className="font-medium tabular-nums">
                    {formatValue(Number(value), data.unit, locale)}
                  </span>
                </span>
              )}
            />
          }
        />
        {keys.map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function LogView({ data }: { data: VariableData }) {
  const t = useTranslations('dashboards.panel');
  const format = useFormatter();
  if (data.kind !== 'log' || data.lines.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('logEmpty')}</p>;
  }
  return (
    <ul className="divide-y overflow-y-auto text-sm">
      {data.lines.map((line, index) => (
        <li key={`${line.at}-${String(index)}`} className="flex min-w-0 items-center gap-2 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{line.action}</span>
          {line.actor && (
            <span className="text-muted-foreground hidden truncate text-xs sm:inline">
              {t('by', { actor: line.actor })}
            </span>
          )}
          <Badge
            variant={line.result === 'success' ? 'secondary' : 'outline'}
            className={cn(line.result !== 'success' && 'text-destructive')}
          >
            {/* i18n-dynamic: dashboards.panel.results */}
            {t(`results.${line.result}`)}
          </Badge>
          <time dateTime={line.at} className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {format.dateTime(new Date(line.at), { timeStyle: 'short' })}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** The places the person can open: their favorites, then the volumes they reach. */
function FoldersView() {
  const t = useTranslations('dashboards.panel');
  const { data, isPending } = useQuery({
    queryKey: ['dashboards', 'folders'],
    queryFn: async () => {
      const [favorites, root] = await Promise.all([listFavorites(), listFolder({ path: '/' })]);
      return {
        favorites: favorites.ok ? favorites.data : [],
        volumes: root.ok ? root.data.entries.filter((entry) => entry.isDirectory) : [],
      };
    },
  });
  if (isPending) return <Skeleton className="size-full min-h-16" aria-label={t('loading')} />;
  const favorites = data?.favorites ?? [];
  const volumes = data?.volumes ?? [];
  if (favorites.length === 0 && volumes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noFolders')}</p>;
  }
  const link = (path: string, name: string, Icon: LucideIcon) => (
    <li key={path}>
      <Link
        href={{ pathname: '/', query: { path } }}
        className="hover:bg-muted flex min-h-10 items-center gap-2 rounded-md px-2 text-sm"
      >
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate">{name}</span>
      </Link>
    </li>
  );
  return (
    <div className="grid gap-3 overflow-y-auto">
      {favorites.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-muted-foreground px-2 text-xs font-medium">{t('favorites')}</h3>
          <ul>{favorites.map((favorite) => link(favorite.path, favorite.name, Star))}</ul>
        </section>
      )}
      {volumes.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-muted-foreground px-2 text-xs font-medium">{t('volumes')}</h3>
          <ul>{volumes.map((volume) => link(volume.path, volume.name, HardDrive))}</ul>
        </section>
      )}
    </div>
  );
}
