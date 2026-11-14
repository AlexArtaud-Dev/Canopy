'use client';

import {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderArchive,
  Link2Off,
  LockKeyhole,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, useTransition, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { useErrorMessage, useFormError } from '@/shared/errors/use-error-message';
import { downloadUrl } from '@/shared/lib/download';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Field, FieldLabel } from '@/shared/ui/field';
import { PasswordInput } from '@/shared/ui/password-input';
import { Spinner } from '@/shared/ui/spinner';
import { formatBytes } from '@/features/files/browser.utils';

import { prepareShareDownload, unlockShare } from './server/public-share-actions';
import type { PublicShare, SharedItem } from './server/public-share';
import { sharedCrumbs, sharePasswordMaxLength } from './shares.utils';
import { LinkUpload } from './ui/link-upload';

/** What a visitor of a share link sees: the password gate, the shared file, or the folder. */
export function PublicShareContainer({ token, share }: { token: string; share: PublicShare }) {
  if (share.state === 'locked') return <Unlock token={token} item={share.item} />;
  if (share.state === 'upload') {
    return (
      <LinkUpload
        token={token}
        item={share.item}
        rules={share.rules}
        usage={share.usage}
        identity={share.identity}
        depositor={share.depositor}
      />
    );
  }
  if (share.state !== 'open') return <Unavailable state={share.state} />;
  return <Shared token={token} share={share} />;
}

function Unavailable({
  state,
}: {
  state: Exclude<PublicShare['state'], 'open' | 'locked' | 'upload'>;
}) {
  const t = useTranslations('shares.public');
  return (
    <Card className="w-full max-w-md">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Link2Off aria-hidden />
          </EmptyMedia>
          {/* i18n-dynamic: shares.public.unavailable */}
          <EmptyTitle>{t(`unavailable.${state}`)}</EmptyTitle>
          <EmptyDescription>{t('unavailableHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  );
}

function Unlock({ token, item }: { token: string; item: SharedItem }) {
  const t = useTranslations('shares.public');
  const router = useRouter();
  const toFormError = useFormError();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) return;
    startTransition(async () => {
      const result = await unlockShare({ token, password });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      router.refresh();
    });
  };
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="size-4" aria-hidden />
          {item.name}
        </CardTitle>
        <CardDescription>{t('locked')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          {error && <FormError error={error} />}
          <Field>
            <FieldLabel htmlFor="share-password">{t('password')}</FieldLabel>
            <PasswordInput
              id="share-password"
              value={password}
              maxLength={sharePasswordMaxLength}
              autoComplete="off"
              autoFocus
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" disabled={!password || pending} aria-busy={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {t('unlock')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function useDownload(token: string) {
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const start = async (path: string, folder: boolean) => {
    setBusy(path);
    const result = await prepareShareDownload({ token, path, folder });
    setBusy(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      router.refresh();
      return;
    }
    downloadUrl(result.data.href);
    // The remaining download count changed.
    router.refresh();
  };
  return { busy, start };
}

function Shared({
  token,
  share,
}: {
  token: string;
  share: Extract<PublicShare, { state: 'open' }>;
}) {
  const t = useTranslations('shares.public');
  const format = useFormatter();
  const locale = useLocale();
  const download = useDownload(token);
  const { item } = share;
  const details = [
    t('expires', { date: format.dateTime(new Date(item.expiresAt), { dateStyle: 'medium' }) }),
    ...(item.downloadsLeft === null ? [] : [t('downloadsLeft', { count: item.downloadsLeft })]),
  ].join(' · ');

  if (!item.isDirectory) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <File className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="truncate">{item.name}</span>
          </CardTitle>
          <CardDescription>{details}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            disabled={download.busy !== null}
            onClick={() => void download.start('/', false)}
          >
            {download.busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Download aria-hidden data-icon="inline-start" />
            )}
            {t('download')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const base = `/s/${token}`;
  const hrefFor = (path: string) =>
    (path === '/' ? base : `${base}?path=${encodeURIComponent(path)}`) as Route;
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <Folder className="fill-primary/15 text-primary size-5 shrink-0" aria-hidden />
              <span className="truncate">{item.name}</span>
            </CardTitle>
            <CardDescription>{details}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={download.busy !== null}
            onClick={() => void download.start(share.path, true)}
          >
            <FolderArchive aria-hidden data-icon="inline-start" />
            {t('downloadAll')}
          </Button>
        </div>
        <nav aria-label={t('breadcrumbs')} className="flex flex-wrap items-center gap-0.5 text-sm">
          <Link href={hrefFor('/')} className="hover:underline">
            {item.name}
          </Link>
          {sharedCrumbs(share.path).map((crumb) => (
            <span key={crumb.path} className="flex items-center gap-0.5">
              <ChevronRight className="text-muted-foreground size-3.5" aria-hidden />
              <Link href={hrefFor(crumb.path)} className="hover:underline">
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
      </CardHeader>
      <CardContent>
        {share.entries.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('emptyFolder')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {share.entries.map((entry) => (
              <li key={entry.path} className="flex min-h-11 items-center gap-3 px-3 py-1.5 text-sm">
                {entry.isDirectory ? (
                  <Folder className="fill-primary/15 text-primary size-4 shrink-0" aria-hidden />
                ) : (
                  <File className="text-muted-foreground size-4 shrink-0" aria-hidden />
                )}
                {entry.isDirectory ? (
                  <Link
                    href={hrefFor(entry.path)}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {entry.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                )}
                <span className="text-muted-foreground hidden tabular-nums sm:block">
                  {entry.isDirectory ? '' : formatBytes(entry.size, locale)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={download.busy !== null}
                  aria-label={t('downloadItem', { name: entry.name })}
                  onClick={() => void download.start(entry.path, entry.isDirectory)}
                >
                  {download.busy === entry.path ? <Spinner /> : <Download aria-hidden />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {share.truncated && <p className="text-muted-foreground mt-3 text-xs">{t('truncated')}</p>}
      </CardContent>
    </Card>
  );
}
