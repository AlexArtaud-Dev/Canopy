'use client';

import 'react-grid-layout/css/styles.css';

import { GripVertical, Move } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

import { gridColumns, type Panel } from '../dashboards.utils';
import { applyGrid, gridItems, maxPanelRows, nudgePanel, nudges, type Nudge } from '../grid.utils';

/** Grid row height and gaps, the same as the dashboard's resting layout. */
export const gridRowHeightPx = 88;
const gapPx = 16;

interface DashboardGridProps {
  panels: Panel[];
  onChange: (panels: Panel[]) => void;
  /** What a panel shows while it is being arranged. */
  renderPanel: (panel: Panel) => ReactNode;
}

/**
 * Arranging a dashboard: drag a panel by its title bar, resize it from its corner, or move it with
 * the keyboard from its Arrange menu (each step announced). Panels slide up to fill the gaps.
 */
export function DashboardGrid({ panels, onChange, renderPanel }: DashboardGridProps) {
  const t = useTranslations('dashboards.grid');
  const { width, containerRef, mounted } = useContainerWidth();
  const [announcement, setAnnouncement] = useState('');
  const nudge = (panel: Panel, move: Nudge) => {
    onChange(nudgePanel(panels, panel.id, move));
    // i18n-dynamic: dashboards.grid.moved
    setAnnouncement(t(`moved.${move}`, { title: panel.title }));
  };
  return (
    <div ref={containerRef}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={gridItems(panels).map((item) => ({ ...item, maxH: maxPanelRows }))}
          gridConfig={{
            cols: gridColumns,
            rowHeight: gridRowHeightPx,
            margin: [gapPx, gapPx],
            containerPadding: [0, 0],
          }}
          dragConfig={{ handle: '.panel-drag-handle', cancel: 'button' }}
          resizeConfig={{ handles: ['e', 'w', 's', 'se', 'sw'] }}
          onLayoutChange={(layout: Layout) => {
            onChange(applyGrid(panels, layout));
          }}
        >
          {panels.map((panel) => (
            <div key={panel.id}>
              <Card className="ring-primary/40 size-full gap-3 py-4 ring-2">
                <CardHeader className="flex items-center gap-2 px-4">
                  <div
                    className="panel-drag-handle flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing"
                    title={t('drag')}
                  >
                    <GripVertical aria-hidden className="text-muted-foreground size-4 shrink-0" />
                    <CardTitle className="truncate text-sm">{panel.title}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-my-1"
                        aria-label={t('arrange', { title: panel.title })}
                      >
                        <Move aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {nudges.map((move) => (
                        <DropdownMenuItem
                          key={move}
                          onSelect={() => {
                            nudge(panel, move);
                          }}
                        >
                          {/* i18n-dynamic: dashboards.grid.nudges */}
                          {t(`nudges.${move}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="pointer-events-none flex min-h-0 flex-1 flex-col px-4 select-none">
                  {renderPanel(panel)}
                </CardContent>
              </Card>
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
