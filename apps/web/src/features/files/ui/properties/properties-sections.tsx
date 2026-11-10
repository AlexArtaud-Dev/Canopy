'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { Job } from '@canopy/contracts';

import { isActive, startFolderSize, useJob } from '@/features/jobs';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import type { ActionResult } from '@/shared/lib/action';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import { formatBytes } from '../../browser.utils';
import { useStreamTicket } from '../../model/use-stream-ticket';
import { checksumAlgorithms, previewHref, type ChecksumAlgorithm } from '../../operations.utils';
import { formatTimecode } from '../../preview.utils';
import { readChecksum, readFolderSize } from '../../properties.utils';
import { loadMediaInfo } from '../../server/media';
import { startChecksum } from '../../server/operations';
import { CopyButton, Row } from './properties-row';

/** A job started from the dialog, followed live through the operations panel's stream. */
function useStartedJob() {
  const errorMessage = useErrorMessage();
  const [jobId, setJobId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const job = useJob(jobId);
  const start = (started: Promise<ActionResult<Job>>) => {
    setRefusal(null);
    void started.then((result) => {
      if (result.ok) setJobId(result.data.id);
      else setRefusal(errorMessage(result.error.code, result.error.params));
    });
  };
  const failed = job?.state === 'failed' || job?.state === 'cancelled';
  return {
    job,
    start,
    pending: jobId !== null && (!job || isActive(job)),
    error: refusal ?? (failed ? errorMessage(job.errorCode ?? 'system.internal') : null),
  };
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive mt-1 text-xs">
      {message}
    </p>
  );
}

/** A folder's size is measured on demand, as a job (it can take a while on large trees). */
export function FolderSizeRow({ path }: { path: string }) {
  const t = useTranslations('files.properties');
  const locale = useLocale();
  const { job, start, pending, error } = useStartedJob();
  const size = job?.state === 'succeeded' ? readFolderSize(job.result) : null;

  if (size) {
    return (
      <Row label={t('size')}>
        {formatBytes(size.bytes, locale)}
        <span className="text-muted-foreground block text-xs">
          {t('contents', { files: size.files, folders: size.folders })}
          {size.skipped > 0 && ` · ${t('skipped', { count: size.skipped })}`}
        </span>
      </Row>
    );
  }
  return (
    <Row label={t('size')}>
      {pending ? (
        <span className="text-muted-foreground inline-flex items-center gap-2">
          <Spinner className="size-4" />
          {job && job.bytesDone > 0 ? formatBytes(job.bytesDone, locale) : t('measuring')}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            start(startFolderSize({ path }));
          }}
        >
          {t('calculate')}
        </Button>
      )}
      <ErrorLine message={error} />
    </Row>
  );
}

/** A checksum is computed on demand, as a job, with the algorithm picked here. */
export function ChecksumRow({ path }: { path: string }) {
  const t = useTranslations('files.properties');
  const algorithmT = useTranslations('files.browser.menu.algorithms');
  const [algorithm, setAlgorithm] = useState<ChecksumAlgorithm>('sha256');
  const { job, start, pending, error } = useStartedJob();
  const hash = job?.state === 'succeeded' ? readChecksum(job.result) : null;

  return (
    <Row label={t('checksum')}>
      <span className="flex flex-wrap items-center gap-2">
        <Select
          value={algorithm}
          disabled={pending}
          onValueChange={(value) => {
            const picked = checksumAlgorithms.find((candidate) => candidate === value);
            if (picked) setAlgorithm(picked);
          }}
        >
          <SelectTrigger size="sm" className="w-32" aria-label={t('algorithm')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {checksumAlgorithms.map((name) => (
              <SelectItem key={name} value={name}>
                {/* i18n-dynamic: files.browser.menu.algorithms */}
                {algorithmT(name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            start(startChecksum({ path, algorithm }));
          }}
        >
          {pending && <Spinner className="size-4" />}
          {t('compute')}
        </Button>
      </span>
      {hash && (
        <span className="mt-2 flex items-start gap-1">
          <span className="font-mono text-xs break-all">{hash}</span>
          <CopyButton value={hash} label={t('copyChecksum')} />
        </span>
      )}
      <ErrorLine message={error} />
    </Row>
  );
}

/** Duration, picture size and codecs, read by the engine (ffprobe) when it has ffmpeg. */
export function VideoRows({ path, modified }: { path: string; modified: string }) {
  const t = useTranslations('files.properties');
  const info = useQuery({
    queryKey: ['files', 'media-info', path, modified],
    queryFn: async () => {
      const result = await loadMediaInfo({ path });
      return result.ok ? result.data : null;
    },
    staleTime: Infinity,
    retry: false,
  });
  const media = info.data;
  if (!media?.streamable) return null;
  const codecs = [media.video, media.audio].filter(Boolean).join(' · ');
  return (
    <>
      {media.duration > 0 && <Row label={t('duration')}>{formatTimecode(media.duration)}</Row>}
      {media.width !== undefined && media.height !== undefined && media.width > 0 && (
        <Row label={t('dimensions')}>
          {t('pixels', { width: media.width, height: media.height })}
        </Row>
      )}
      {codecs && (
        <Row label={t('codecs')}>
          <span className="font-mono text-xs uppercase">{codecs}</span>
        </Row>
      )}
    </>
  );
}

/** An image's size, read by the browser from the preview. */
export function ImageRows({ path }: { path: string }) {
  const t = useTranslations('files.properties');
  const ticket = useStreamTicket(true);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (ticket !== 'ready') return;
    const image = new Image();
    image.onload = () => {
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = previewHref(path);
    return () => {
      image.onload = null;
    };
  }, [path, ticket]);
  if (!size || size.width === 0) return null;
  return <Row label={t('dimensions')}>{t('pixels', size)}</Row>;
}
