'use client';

import { useFormatter, useLocale } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/ui/chart';

import type { Panel } from '../dashboards.utils';
import {
  aggregate,
  chartRows,
  colorFor,
  cssColor,
  formatPanelValue,
  type NamedSeries,
} from '../panels.utils';
import type { TimeRange } from '../variables.utils';

/** Theme colours for series, in order (more series reuse them). */
const seriesColors = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const;

/** Counted things have whole-number ticks only. */
function counts(series: readonly NamedSeries[]): boolean {
  return series.every((one) => one.unit === 'count');
}

/** Legends wrap, stay inside their panel (scrolling past two lines) and cut long names. */
const legendClass =
  'max-h-12 flex-wrap justify-start gap-x-3 gap-y-1 overflow-y-auto text-xs [&>div]:min-w-0';

function seriesColor(index: number): string {
  return cssColor(seriesColors[index % seriesColors.length] ?? 'chart-1');
}

function chartConfig(series: readonly NamedSeries[]): ChartConfig {
  return Object.fromEntries(
    series.map((one, index) => [
      one.key,
      {
        // Long names (volumes mounted by id) are cut; the whole name shows on hover.
        label: (
          <span className="block max-w-40 truncate" title={one.label}>
            {one.label}
          </span>
        ),
        color: seriesColor(index),
      },
    ]),
  );
}

/** Ticks and tooltips for time axes, short for short ranges. */
function useTimeFormat(range: TimeRange) {
  const format = useFormatter();
  const short = range === '1h' || range === '6h' || range === '24h';
  return {
    tick: (at: unknown) =>
      typeof at === 'string'
        ? format.dateTime(
            new Date(at),
            short ? { timeStyle: 'short' } : { day: 'numeric', month: 'short' },
          )
        : '',
    full: (at: unknown) =>
      typeof at === 'string'
        ? format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' })
        : '',
  };
}

/** The `at` of the row under the tooltip. */
function rowAt(payload: readonly { payload?: unknown }[]): unknown {
  const row = payload[0]?.payload;
  return typeof row === 'object' && row !== null && 'at' in row ? row.at : null;
}

interface ChartProps {
  panel: Panel;
  series: NamedSeries[];
}

function useValueFormat(panel: Panel, series: readonly NamedSeries[]) {
  const locale = useLocale();
  const unit = series[0]?.unit ?? 'count';
  return (value: number) => formatPanelValue(value, unit, panel.options.decimals, locale);
}

function Tooltip({
  config,
  panel,
  series,
  label,
}: ChartProps & {
  config: ChartConfig;
  label?: (payload: readonly { payload?: unknown }[]) => string;
}) {
  const value = useValueFormat(panel, series);
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          {...(label
            ? {
                labelFormatter: (_: unknown, payload: readonly { payload?: unknown }[]) =>
                  label(payload),
              }
            : {})}
          formatter={(raw, name) => (
            <span className="flex w-full justify-between gap-3">
              <span className="text-muted-foreground">
                {series.find((one) => one.key === String(name))?.label ??
                  config[String(name)]?.label}
              </span>
              <span className="font-medium tabular-nums">{value(Number(raw))}</span>
            </span>
          )}
        />
      }
    />
  );
}

/** Lines or areas over time, one per series; areas can stack. */
export function TimeView({ panel, series, range }: ChartProps & { range: TimeRange }) {
  const time = useTimeFormat(range);
  const value = useValueFormat(panel, series);
  const config = chartConfig(series);
  const rows = chartRows(series);
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="at"
        tickFormatter={time.tick}
        tickLine={false}
        axisLine={false}
        minTickGap={32}
      />
      <YAxis
        width={64}
        tickLine={false}
        axisLine={false}
        tickFormatter={value}
        allowDecimals={!counts(series)}
      />
      <Tooltip
        panel={panel}
        series={series}
        config={config}
        label={(payload) => time.full(rowAt(payload))}
      />
      {panel.options.legend && series.length > 1 && (
        <ChartLegend content={<ChartLegendContent className={legendClass} />} />
      )}
    </>
  );
  return (
    <ChartContainer config={config} className="size-full min-h-32">
      {panel.type === 'area' ? (
        <AreaChart data={rows}>
          {axes}
          {series.map((one) => (
            <Area
              key={one.key}
              dataKey={one.key}
              type="monotone"
              stroke={`var(--color-${one.key})`}
              fill={`var(--color-${one.key})`}
              fillOpacity={0.25}
              {...(panel.options.stacked ? { stackId: 'all' } : {})}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={rows}>
          {axes}
          {series.map((one) => (
            <Line
              key={one.key}
              dataKey={one.key}
              type="monotone"
              stroke={`var(--color-${one.key})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  );
}

/** What Recharts hands a bar's shape: the rectangle, and the value it stands for. */
type BarShapeProps = React.ComponentProps<typeof Rectangle> & { value?: unknown };

/** A bar's fill: the colour of the highest rule its value reaches, else the series colour. */
function ruleFill(value: unknown, rules: Panel['rules'], fallback: string): string {
  const color = colorFor(typeof value === 'number' ? value : null, rules);
  return color ? cssColor(color) : fallback;
}

/** Bars over time, one per series and bucket (stacked if asked), coloured by the rules. */
export function BarView({ panel, series, range }: ChartProps & { range: TimeRange }) {
  const time = useTimeFormat(range);
  const value = useValueFormat(panel, series);
  const config = chartConfig(series);
  const rows = chartRows(series);
  return (
    <ChartContainer config={config} className="size-full min-h-32">
      <BarChart data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="at"
          tickFormatter={time.tick}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          tickFormatter={value}
          allowDecimals={!counts(series)}
        />
        <Tooltip
          panel={panel}
          series={series}
          config={config}
          label={(payload) => time.full(rowAt(payload))}
        />
        {panel.options.legend && series.length > 1 && (
          <ChartLegend content={<ChartLegendContent className={legendClass} />} />
        )}
        {series.map((one) => (
          <Bar
            key={one.key}
            dataKey={one.key}
            fill={`var(--color-${one.key})`}
            radius={2}
            {...(panel.options.stacked ? { stackId: 'all' } : {})}
            isAnimationActive={false}
            {...(panel.rules.length > 0
              ? {
                  shape: (props: BarShapeProps) => (
                    <Rectangle
                      {...props}
                      fill={ruleFill(props.value, panel.rules, `var(--color-${one.key})`)}
                    />
                  ),
                }
              : {})}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** A ring of each series' value (aggregated), for shares of a whole. */
export function PieView({ panel, series }: ChartProps) {
  const config = chartConfig(series);
  const slices = series.flatMap((one, index) => {
    const value = aggregate(one, panel.options.aggregation);
    return value === null || value <= 0
      ? []
      : [
          {
            key: one.key,
            value,
            fill: cssColor(
              colorFor(value, panel.rules) ??
                seriesColors[index % seriesColors.length] ??
                'chart-1',
            ),
          },
        ];
  });
  return (
    <ChartContainer config={config} className="mx-auto aspect-square size-full max-h-64 min-h-32">
      <PieChart>
        <Tooltip panel={panel} series={series} config={config} />
        <Pie
          data={slices}
          dataKey="value"
          nameKey="key"
          innerRadius="55%"
          isAnimationActive={false}
        />
        {panel.options.legend && (
          <ChartLegend content={<ChartLegendContent nameKey="key" className={legendClass} />} />
        )}
      </PieChart>
    </ChartContainer>
  );
}
