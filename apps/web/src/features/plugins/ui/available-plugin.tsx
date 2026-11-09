'use client';

import { Download, ExternalLink, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

import type { RepoView } from '../plugins.utils';

interface AvailablePluginProps {
  source: RepoView;
  busy: boolean;
  onInstall: () => void;
}

/** An allowlisted repository not installed yet: its latest release, notes and install. */
export function AvailablePlugin({ source, busy, onInstall }: AvailablePluginProps) {
  const t = useTranslations('plugins.available');
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { release } = source;

  return (
    <li className="grid gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{source.repo}</span>
        {release && <Badge variant="secondary">v{release.version}</Badge>}
        {release?.publishedAt && (
          <span className="text-muted-foreground text-sm">
            {format.dateTime(new Date(release.publishedAt), { dateStyle: 'medium' })}
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {release && (
            <Button variant="ghost" size="sm" asChild>
              <a href={release.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink aria-hidden />
                {t('releasePage')}
              </a>
            </Button>
          )}
          <Button size="sm" disabled={!release || busy} onClick={onInstall}>
            {busy ? <Spinner /> : <Download aria-hidden />}
            {busy ? t('installing') : t('install')}
          </Button>
        </div>
      </div>
      {source.error && (
        <p className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4" aria-hidden />
          {errorMessage(source.error)}
        </p>
      )}
      {release?.notes && (
        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
            {t('notes')}
          </summary>
          <p className="bg-muted mt-2 max-h-60 overflow-auto rounded-md p-3 whitespace-pre-wrap">
            {release.notes}
          </p>
        </details>
      )}
    </li>
  );
}
