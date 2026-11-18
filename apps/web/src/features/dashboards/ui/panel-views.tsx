'use client';

import { useQuery } from '@tanstack/react-query';
import { HardDrive, Star, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { listFavorites } from '@/features/files/server/favorites';
import { listFolder } from '@/features/files/server/browse';

import type { Panel } from '../dashboards.utils';
import { usePanelData } from '../model/use-variable-data';
import {
  aggregate,
  colorFor,
  cssColor,
  formatPanelValue,
  gaugeShare,
  type NamedSeries,
} from '../panels.utils';
import type { LogLine, TimeRange } from '../variables.utils';
import { BarView, PieView, TimeView } from './panel-charts';

interface PanelViewProps {
  panel: Panel;
  range: TimeRange;
  refreshSeconds: number;
}

/** What a panel shows, by its type. */
export function PanelView(props: PanelViewProps) {
  if (props.panel.type === 'folders') return <FoldersView />;
  if (props.panel.variables.length === 0) return <NoVariable />;
  return <VariablesView {...props} />;
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function NoVariable() {
  const t = useTranslations('dashboards.panel');
  return <Message>{t('noVariable')}</Message>;
}

/** Loads the panel's variables, names their series, and draws them by type. */
function VariablesView({ panel, range, refreshSeconds }: PanelViewProps) {
  const t = useTranslations('dashboards');
  const errorMessage = useErrorMessage();
  const state = usePanelData(panel.variables, range, refreshSeconds);
  if (state.status === 'loading') {
    return <Skeleton className="size-full min-h-16" aria-label={t('panel.loading')} />;
  }
  if (state.status === 'error') {
    return (
      <Message>
        {state.code === 'metrics.forbidden' ? t('panel.unreadable') : errorMessage(state.code)}
      </Message>
    );
  }
  if (panel.type === 'log') {
    const first = state.data[0]?.data;
    return <LogView lines={first?.kind === 'log' ? first.lines : []} />;
  }
  const series: NamedSeries[] = [];
  for (const { id, data } of state.data) {
    if (data.kind !== 'series') continue;
    // i18n-dynamic: dashboards.variables
    const label = t(`variables.${id}` as 'variables.system.cpu');
    for (const one of data.series) {
      series.push({
        key: `s${String(series.length)}`,
        label: one.name ? `${label} · ${one.name}` : label,
        unit: data.unit,
        points: one.points,
        ...(data.total === undefined ? {} : { total: data.total }),
      });
    }
  }
  const empty = series.every((one) => one.points.length === 0 && one.total === undefined);
  if (empty) return <Message>{t('panel.noData')}</Message>;
  switch (panel.type) {
    case 'gauge':
      return <GaugeView panel={panel} series={series} />;
    case 'line':
    case 'area':
      return <TimeView panel={panel} series={series} range={range} />;
    case 'bar':
      return <BarView panel={panel} series={series} range={range} />;
    case 'pie':
      return <PieView panel={panel} series={series} />;
    case 'table':
      return <TableView panel={panel} series={series} />;
    default:
      return <StatView panel={panel} series={series} />;
  }
}

/** One big number (the first series), coloured by the rules. */
function StatView({ panel, series }: { panel: Panel; series: NamedSeries[] }) {
  const t = useTranslations('dashboards.panel');
  const locale = useLocale();
  const first = series[0];
  const value = first ? aggregate(first, panel.options.aggregation) : null;
  if (!first || value === null) return <Message>{t('noData')}</Message>;
  const color = colorFor(value, panel.rules);
  return (
    <p
      className="text-3xl font-semibold tracking-tight tabular-nums"
      style={color ? { color: cssColor(color) } : undefined}
    >
      {formatPanelValue(value, first.unit, panel.options.decimals, locale)}
    </p>
  );
}

/** A half circle of radius 40: its length is 40π. */
const gaugeLength = Math.PI * 40;
const gaugeArc = 'M10 50 A40 40 0 0 1 90 50';

/**
 * A half ring filled to the value. Its maximum is the panel's, or the second variable (used out
 * of total), or 100.
 */
function GaugeView({ panel, series }: { panel: Panel; series: NamedSeries[] }) {
  const t = useTranslations('dashboards.panel');
  const locale = useLocale();
  const [first, second] = series;
  const value = first ? aggregate(first, panel.options.aggregation) : null;
  if (!first || value === null) return <Message>{t('noData')}</Message>;
  const max = panel.options.max ?? (second ? aggregate(second, 'last') : null) ?? 100;
  const share = gaugeShare(value, panel.options.min, max);
  const color = colorFor(value, panel.rules) ?? 'chart-1';
  const format = (number: number) =>
    formatPanelValue(number, first.unit, panel.options.decimals, locale);
  return (
    <figure className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
      <svg
        viewBox="0 0 100 56"
        className="w-full max-w-56"
        role="img"
        aria-label={t('gaugeLabel', { value: format(value), max: format(max) })}
      >
        <path
          d={gaugeArc}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={gaugeArc}
          fill="none"
          stroke={cssColor(color)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${String(share * gaugeLength)} ${String(gaugeLength)}`}
        />
      </svg>
      <figcaption className="text-center">
        <span className="block text-2xl font-semibold tabular-nums">{format(value)}</span>
        <span className="text-muted-foreground text-xs">{t('outOf', { max: format(max) })}</span>
      </figcaption>
    </figure>
  );
}

/** One row per series, its value coloured by the rules. */
function TableView({ panel, series }: { panel: Panel; series: NamedSeries[] }) {
  const t = useTranslations('dashboards.panel');
  const locale = useLocale();
  return (
    <div className="min-h-0 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{t('name')}</th>
            <th>{t('value')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {series.map((one) => {
            const value = aggregate(one, panel.options.aggregation);
            const color = colorFor(value, panel.rules);
            return (
              <tr key={one.key}>
                <td className="max-w-0 truncate py-1.5 pr-2">{one.label}</td>
                <td
                  className="py-1.5 text-right font-medium whitespace-nowrap tabular-nums"
                  style={color ? { color: cssColor(color) } : undefined}
                >
                  {value === null
                    ? '—'
                    : formatPanelValue(value, one.unit, panel.options.decimals, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LogView({ lines }: { lines: readonly LogLine[] }) {
  const t = useTranslations('dashboards.panel');
  const format = useFormatter();
  if (lines.length === 0) return <Message>{t('logEmpty')}</Message>;
  return (
    <ul className="divide-y overflow-y-auto text-sm">
      {lines.map((line, index) => (
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
  if (favorites.length === 0 && volumes.length === 0) return <Message>{t('noFolders')}</Message>;
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
