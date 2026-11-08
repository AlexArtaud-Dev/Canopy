'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderPlus,
  Keyboard,
  LayoutGrid,
  List,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

import { sortKeys, type BrowserView, type SortKey, type SortOrder } from '../browser.utils';
import { breadcrumbs } from '../files.utils';
import { DropCrumb } from './dnd';

interface BrowserToolbarProps {
  path: string;
  hrefFor: (path: string) => string;
  view: BrowserView;
  onViewChange: (view: BrowserView) => void;
  sort: SortKey;
  order: SortOrder;
  onSort: (key: SortKey) => void;
  onOrder: (order: SortOrder) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onShowShortcuts: () => void;
  /** Shown only when the person may create items in this folder. */
  canCreate: boolean;
  onNewFolder: () => void;
}

export function BrowserToolbar(props: BrowserToolbarProps) {
  const t = useTranslations('files.browser');
  const crumbs = breadcrumbs(props.path);
  const OrderIcon = props.order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
      <nav
        aria-label={t('breadcrumbs')}
        className="flex min-w-0 flex-1 items-center gap-0.5 text-sm"
      >
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          const label = crumb.path === '/' ? t('root') : crumb.name;
          return (
            <span key={crumb.path} className={cnCrumb(current)}>
              {current ? (
                <span aria-current="page" className="truncate px-2 font-medium">
                  {label}
                </span>
              ) : (
                <DropCrumb path={crumb.path}>
                  <Button asChild variant="ghost" size="sm" className="max-w-40 min-w-0">
                    <Link href={props.hrefFor(crumb.path) as Route}>
                      <span className="truncate">{label}</span>
                    </Link>
                  </Button>
                </DropCrumb>
              )}
              {!current && (
                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex items-center gap-1">
        {props.canCreate && (
          <Button variant="outline" size="sm" onClick={props.onNewFolder}>
            <FolderPlus aria-hidden data-icon="inline-start" />
            {t('ops.newFolder')}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <OrderIcon aria-hidden data-icon="inline-start" />
              {/* i18n-dynamic: files.browser.sort */}
              {t(`sort.${props.sort}` as Parameters<typeof t>[0])}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={props.sort}
              onValueChange={(value) => {
                props.onSort(value as SortKey);
              }}
            >
              {sortKeys.map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {t(`sort.${key}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={props.order}
              onValueChange={(value) => {
                props.onOrder(value === 'desc' ? 'desc' : 'asc');
              }}
            >
              <DropdownMenuRadioItem value="asc">{t('ascending')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">{t('descending')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={props.view}
          onValueChange={(value) => {
            if (value === 'list' || value === 'grid') props.onViewChange(value);
          }}
          aria-label={t('view')}
        >
          <ToggleGroupItem value="list" aria-label={t('listView')}>
            <List aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label={t('gridView')}>
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={props.onRefresh}
              aria-label={t('refresh')}
            >
              {props.refreshing ? <Spinner /> : <RefreshCw aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('refresh')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden sm:inline-flex"
              onClick={props.onShowShortcuts}
              aria-label={t('shortcuts.title')}
            >
              <Keyboard aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('shortcuts.title')} (?)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function cnCrumb(current: boolean) {
  return current ? 'flex min-w-0 items-center' : 'flex min-w-0 shrink items-center';
}
