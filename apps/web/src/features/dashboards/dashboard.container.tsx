'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type CSSProperties } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { ActionResult } from '@/shared/lib/action';

import {
  readingOrder,
  refreshOptions,
  type Dashboard,
  type DashboardInput,
} from './dashboards.utils';
import {
  createDashboard,
  duplicateDashboard,
  makeHomeDashboard,
  removeDashboard,
  resetDashboard,
  saveDashboard,
} from './server/dashboards-actions';
import { DashboardNameDialog } from './ui/dashboard-name-dialog';
import { PanelView } from './ui/panel-views';
import { timeRanges } from './variables.utils';

/** Height of one grid row on a wide screen; panels span whole rows. */
const rowHeightPx = 88;

/** Custom properties for the grid placement (the values are computed per panel). */
function cssVars(vars: Record<`--${string}`, string>): CSSProperties {
  const style: CSSProperties & Record<`--${string}`, string> = { ...vars };
  return style;
}

type Dialog = 'none' | 'create' | 'rename' | 'delete' | 'reset';

interface DashboardContainerProps {
  dashboards: Dashboard[];
  current: Dashboard;
}

/**
 * One of the person's dashboards: pick another, change the time range and refresh, manage it,
 * and its panels on a grid (stacked in reading order on a phone).
 */
export function DashboardContainer({ dashboards, current: initial }: DashboardContainerProps) {
  const t = useTranslations('dashboards.page');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>('none');
  const [pending, startTransition] = useTransition();

  const run = <T,>(action: () => Promise<ActionResult<T>>, done: (data: T) => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      setDialog('none');
      done(result.data);
    });
  };
  const open = (id: string) => {
    router.push(`/dashboards/${id}`);
  };
  const save = (change: Partial<DashboardInput>) => {
    const next = { ...current, ...change };
    setCurrent(next);
    run(
      () =>
        saveDashboard({
          id: next.id,
          name: next.name,
          range: next.range,
          refreshSeconds: next.refreshSeconds,
          panels: next.panels,
        }),
      (saved) => {
        setCurrent(saved);
        router.refresh();
      },
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={current.id} onValueChange={open}>
          <SelectTrigger className="w-full sm:w-64" aria-label={t('choose')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dashboards.map((dashboard) => (
              <SelectItem key={dashboard.id} value={dashboard.id}>
                {dashboard.isHome && <Home aria-hidden />}
                {dashboard.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={current.range}
          onValueChange={(value) => {
            const range = timeRanges.find((candidate) => candidate === value);
            if (range) save({ range });
          }}
        >
          <SelectTrigger className="w-36" aria-label={t('range')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeRanges.map((range) => (
              <SelectItem key={range} value={range}>
                {/* i18n-dynamic: dashboards.page.ranges */}
                {t(`ranges.${range}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(current.refreshSeconds)}
          onValueChange={(value) => {
            const refreshSeconds = refreshOptions.find((option) => String(option) === value);
            if (refreshSeconds !== undefined) save({ refreshSeconds });
          }}
        >
          <SelectTrigger className="w-44" aria-label={t('refresh')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refreshOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {/* i18n-dynamic: dashboards.page.refreshEvery */}
                {t(`refreshEvery.${String(option) as '0' | '30' | '60' | '300'}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('refreshNow')}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
            }}
          >
            <RefreshCw aria-hidden />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('actions')}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setDialog('create');
                }}
              >
                <Plus aria-hidden />
                {t('new')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  run(
                    () => duplicateDashboard({ id: current.id }),
                    (copy) => {
                      open(copy.id);
                    },
                  );
                }}
              >
                <Copy aria-hidden />
                {t('duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setDialog('rename');
                }}
              >
                <PencilLine aria-hidden />
                {t('rename')}
              </DropdownMenuItem>
              {!current.isHome && (
                <DropdownMenuItem
                  onSelect={() => {
                    run(
                      () => makeHomeDashboard({ id: current.id }),
                      () => {
                        setCurrent({ ...current, isHome: true });
                        router.refresh();
                      },
                    );
                  }}
                >
                  <Home aria-hidden />
                  {t('makeHome')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  setDialog('reset');
                }}
              >
                <RotateCcw aria-hidden />
                {t('reset')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDialog('delete');
                }}
              >
                <Trash2 aria-hidden />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {current.panels.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutDashboard aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('empty')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                setDialog('reset');
              }}
            >
              <RotateCcw aria-hidden />
              {t('reset')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:[grid-auto-rows:var(--row)]"
          style={cssVars({ '--row': `${String(rowHeightPx)}px` })}
        >
          {readingOrder(current.panels).map((panel) => (
            <Card
              key={panel.id}
              className="min-h-40 gap-3 py-4 lg:min-h-0 lg:[grid-column:var(--col)] lg:[grid-row:var(--row-span)]"
              style={cssVars({
                '--col': `${String(panel.layout.x + 1)} / span ${String(panel.layout.w)}`,
                '--row-span': `${String(panel.layout.y + 1)} / span ${String(panel.layout.h)}`,
              })}
            >
              <CardHeader className="px-4">
                <CardTitle className="truncate text-sm">{panel.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col px-4">
                <PanelView
                  panel={panel}
                  range={current.range}
                  refreshSeconds={current.refreshSeconds}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(dialog === 'create' || dialog === 'rename') && (
        <DashboardNameDialog
          mode={dialog}
          initial={dialog === 'rename' ? current.name : ''}
          pending={pending}
          onClose={() => {
            setDialog('none');
          }}
          onSubmit={(name) => {
            if (dialog === 'rename') {
              save({ name });
              setDialog('none');
              return;
            }
            run(
              () => createDashboard({ name }),
              (created) => {
                open(created.id);
              },
            );
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === 'delete'}
        destructive
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: current.name })}
        confirmLabel={t('delete')}
        pending={pending}
        onConfirm={() => {
          run(
            () => removeDashboard({ id: current.id }),
            () => {
              toast.success(t('deleted'));
              router.push('/dashboards');
              router.refresh();
            },
          );
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDialog('none');
        }}
      />
      <ConfirmDialog
        open={dialog === 'reset'}
        title={t('resetTitle')}
        description={t('resetDescription', { name: current.name })}
        confirmLabel={t('reset')}
        pending={pending}
        onConfirm={() => {
          run(
            () => resetDashboard({ id: current.id }),
            (saved) => {
              setCurrent(saved);
              router.refresh();
            },
          );
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDialog('none');
        }}
      />
    </div>
  );
}
