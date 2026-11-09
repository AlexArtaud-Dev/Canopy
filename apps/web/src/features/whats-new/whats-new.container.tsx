'use client';

import { Sparkles } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { localized } from '@/features/commands';

import { useLastSeenRelease } from './model/use-last-seen-release';
import { groupByType, isNewSince, issuesUrl, unreleased, type Release } from './whats-new.utils';

interface WhatsNewContainerProps {
  version: string;
  dev: boolean;
  releases: Release[];
  latest: string | null;
}

/** Pending "seen" mark of an unmount; a dev double-mount re-runs the effect and cancels it. */
let pendingMark: number | undefined;

/**
 * The changelog by version then type, in the person's language. Releases newer than the last one
 * seen are marked "New" while the page is open; leaving it (or closing the tab) marks them seen,
 * which also clears the account menu's dot.
 */
export function WhatsNewContainer({ version, dev, releases, latest }: WhatsNewContainerProps) {
  const t = useTranslations('whatsNew');
  const format = useFormatter();
  const locale = useLocale();
  const [lastSeen, markSeen] = useLastSeenRelease();

  useEffect(() => {
    if (!latest) return;
    window.clearTimeout(pendingMark);
    const mark = () => {
      markSeen(latest);
    };
    window.addEventListener('pagehide', mark);
    return () => {
      window.removeEventListener('pagehide', mark);
      pendingMark = window.setTimeout(mark, 0);
    };
  }, [latest, markSeen]);

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground text-sm">
        {dev ? t('devBuild') : t('version', { version })}
      </p>
      {releases.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        releases.map((release) => {
          const headingId = `release-${release.version}`;
          return (
            <Card key={release.version} aria-labelledby={headingId}>
              <CardHeader>
                <CardTitle id={headingId} className="flex flex-wrap items-center gap-2">
                  {release.version === unreleased ? t('unreleased') : release.version}
                  {lastSeen !== undefined && isNewSince(release.version, lastSeen) && (
                    <Badge>{t('newBadge')}</Badge>
                  )}
                  {release.date && (
                    <span className="text-muted-foreground text-sm font-normal">
                      {format.dateTime(new Date(`${release.date}T00:00:00Z`), {
                        dateStyle: 'long',
                        timeZone: 'UTC',
                      })}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                {groupByType(release.entries).map((group) => (
                  <section key={group.type} className="grid gap-2">
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {/* i18n-dynamic: whatsNew.types */}
                      {t(`types.${group.type}`)}
                    </h3>
                    <ul className="grid gap-2">
                      {group.entries.map((entry) => (
                        <li
                          key={`${entry.issue}-${entry.scope}-${entry.text.en}`}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Badge variant="outline" className="mt-0.5 shrink-0 font-mono">
                            {entry.scope}
                          </Badge>
                          <span className="min-w-0 flex-1">{localized(entry.text, locale)}</span>
                          <a
                            href={`${issuesUrl}/${entry.issue}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs underline-offset-4 hover:underline"
                            aria-label={t('issue', { issue: entry.issue })}
                          >
                            #{entry.issue}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
