'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { localized } from '@/features/commands/commands.utils';
import { formatBytes } from '@/features/files/browser.utils';
import { Button } from '@/shared/ui/button';

import { useViewData } from '../plugin-view.container';
import { viewHref, type ViewRef } from '../plugin-views.utils';
import { usePluginViews } from './plugin-views-nav';
import { ViewIcon } from './view-look';

/** A slower pace in the header than on the view's own page. */
const widgetRefreshFactor = 3;

/** One pill per view that asks for it, there only while the view says it is active. */
export function ViewWidgets() {
  const views = usePluginViews().data ?? [];
  return (
    <>
      {views
        .filter((ref) => ref.view.widget)
        .map((ref) => (
          <ViewWidget key={`${ref.pluginId}/${ref.view.id}`} viewRef={ref} />
        ))}
    </>
  );
}

function ViewWidget({ viewRef }: { viewRef: ViewRef }) {
  const t = useTranslations('pluginViews');
  const locale = useLocale();
  const pathname = usePathname();
  const href = viewHref(viewRef.pluginId, viewRef.view.id);
  // On its own page the view reads at its pace; elsewhere the header reads it more slowly.
  const pace = pathname === href ? 1 : widgetRefreshFactor;
  const summary = useViewData(viewRef, viewRef.view.refreshSeconds * pace).data?.summary;
  if (!summary?.active || pathname === href) return null;
  const name = localized(viewRef.view.name, locale);
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5 tabular-nums">
      <Link href={href as Route} aria-label={t('open', { name })} title={name}>
        <ViewIcon name={viewRef.view.icon} aria-hidden className="text-primary animate-pulse" />
        {summary.progress !== null && <span>{Math.round(summary.progress * 100)} %</span>}
        {summary.speed ? (
          <span className="text-muted-foreground max-sm:hidden">
            {t('speed', { speed: formatBytes(summary.speed, locale) })}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
