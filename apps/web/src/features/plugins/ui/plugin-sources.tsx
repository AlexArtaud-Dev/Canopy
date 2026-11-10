'use client';

import { ExternalLink, GitBranch, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type SyntheticEvent } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';

import type { RepoView } from '../plugins.utils';

interface PluginSourcesProps {
  /** The allowed repositories with their latest release; undefined while GitHub is read. */
  sources: readonly RepoView[] | undefined;
  errorMessage: (code: string) => string;
  /** Checks then adds a repository; resolves to an error message, or null when added. */
  onAdd: (repo: string) => Promise<string | null>;
  onRemove: (repo: string) => Promise<void>;
}

/** The allowlist of plugin repositories: each one checked when added, removable at any time. */
export function PluginSources({ sources, errorMessage, onAdd, onRemove }: PluginSourcesProps) {
  const t = useTranslations('plugins.page');
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.trim() === '' || adding) return;
    setAdding(true);
    setError(null);
    const failure = await onAdd(draft);
    setAdding(false);
    if (failure) setError(failure);
    else setDraft('');
  };

  return (
    <section className="grid gap-3" aria-labelledby="plugins-sources">
      <div className="grid gap-1">
        <h2 id="plugins-sources" className="text-base font-semibold">
          {t('sourcesTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('sourcesDescription')}</p>
      </div>

      {sources === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : sources.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          {t('noSources')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {sources.map((source) => (
            <li key={source.repo} className="flex min-h-12 items-center gap-3 px-3 py-2">
              <GitBranch className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <a
                href={`https://github.com/${source.repo}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
              >
                <span className="truncate">{source.repo}</span>
                <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden />
              </a>
              {source.release ? (
                <Badge variant="secondary" className="font-mono">
                  {source.release.version}
                </Badge>
              ) : (
                source.error && (
                  <span className="text-destructive truncate text-xs">
                    {errorMessage(source.error)}
                  </span>
                )
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="ms-auto shrink-0"
                aria-label={t('removeSource', { repo: source.repo })}
                onClick={() => {
                  setRemoving(source.repo);
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void submit(event)} className="grid gap-2">
        <Field data-invalid={error !== null || undefined}>
          <FieldLabel htmlFor={inputId}>{t('sourceLabel')}</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={inputId}
              value={draft}
              disabled={adding}
              placeholder={t('sourcePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={error !== null || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
            />
            <Button type="submit" disabled={adding || draft.trim() === ''} className="shrink-0">
              {adding ? <Spinner aria-hidden /> : <Plus aria-hidden />}
              {t('addSource')}
            </Button>
          </div>
          {adding && (
            <p className="text-muted-foreground text-xs" role="status">
              {t('checking')}
            </p>
          )}
          {error && <FieldError id={errorId}>{error}</FieldError>}
        </Field>
      </form>

      <ConfirmDialog
        open={removing !== null}
        title={t('removeSourceTitle', { repo: removing ?? '' })}
        description={t('removeSourceDescription')}
        confirmLabel={t('removeSourceConfirm')}
        destructive
        pending={removePending}
        onConfirm={() => {
          if (!removing) return;
          setRemovePending(true);
          void onRemove(removing).finally(() => {
            setRemovePending(false);
            setRemoving(null);
          });
        }}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />
    </section>
  );
}
