'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FilePlus,
  Folder,
  FolderPlus,
  FolderUp,
  Keyboard,
  LayoutGrid,
  List,
  MoreHorizontal,
  RefreshCw,
  Star,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import { cn } from 'cn';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { SearchBox } from './search-box';

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
  /** Shown only when the person may upload into this folder. */
  canUpload: boolean;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  /** Search words (URL `q`); results replace the folder's entries. */
  search: string;
  onSearch: (q: string) => void;
  /** Pinned state of the open folder; null at the root, which cannot be pinned. */
  favorite: boolean | null;
  onToggleFavorite: () => void;
}

export function BrowserToolbar(props: BrowserToolbarProps) {
  const t = useTranslations('files.browser');
  const crumbs = breadcrumbs(props.path);
  const OrderIcon = props.order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
      <nav
        aria-label={t('breadcrumbs')}
        className="flex min-w-0 flex-1 items-center gap-0.5 text-sm max-sm:basis-full"
      >
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          const label = crumb.path === '/' ? t('root') : crumb.name;
          // On a phone the folders between the root and the current one fold into "…".
          const middle = index > 0 && !current;
          return (
            <Fragment key={crumb.path}>
              {index === 1 && crumbs.length > 2 && (
                <span className="flex shrink-0 items-center sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={t('hiddenFolders')}>
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 max-w-[85vw]">
                      {crumbs.slice(1, -1).map((hidden) => (
                        <DropdownMenuItem key={hidden.path} asChild>
                          <Link href={props.hrefFor(hidden.path) as Route}>
                            <Folder aria-hidden />
                            <span className="truncate">{hidden.name}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                </span>
              )}
              <span className={cn(cnCrumb(current), middle && 'max-sm:hidden')}>
                {current ? (
                  <span aria-current="page" className="truncate px-2 font-medium">
                    {label}
                  </span>
                ) : (
                  <DropCrumb path={crumb.path}>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="max-w-40 min-w-0 shrink max-sm:max-w-32"
                    >
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
            </Fragment>
          );
        })}
        {props.favorite !== null && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={props.favorite}
            aria-label={props.favorite ? t('menu.removeFavorite') : t('menu.addFavorite')}
            title={props.favorite ? t('menu.removeFavorite') : t('menu.addFavorite')}
            onClick={props.onToggleFavorite}
          >
            <Star
              aria-hidden
              className={props.favorite ? 'fill-primary text-primary' : undefined}
            />
          </Button>
        )}
      </nav>
      <SearchBox
        value={props.search}
        onSearch={props.onSearch}
        className="order-last w-full sm:order-none sm:w-56"
      />
      {/* On a phone the buttons keep their icons only: the row must fit the screen. */}
      <div className="flex items-center gap-1">
        {props.canUpload && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Upload aria-hidden data-icon="inline-start" />
                <span className="max-sm:sr-only">{t('ops.upload')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={props.onUploadFiles}>
                <FilePlus aria-hidden />
                {t('ops.uploadFiles')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onUploadFolder}>
                <FolderUp aria-hidden />
                {t('ops.uploadFolder')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {props.canCreate && (
          <Button variant="outline" size="sm" onClick={props.onNewFolder}>
            <FolderPlus aria-hidden data-icon="inline-start" />
            <span className="max-sm:sr-only">{t('ops.newFolder')}</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <OrderIcon aria-hidden data-icon="inline-start" />
              <span className="max-sm:sr-only">
                {/* i18n-dynamic: files.browser.sort */}
                {t(`sort.${props.sort}` as Parameters<typeof t>[0])}
              </span>
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
