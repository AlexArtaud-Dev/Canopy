'use client';

import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  FolderInput,
  Upload as UploadIcon,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'tus-js-client';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { formatBytes } from '@/features/files/browser.utils';
import { uploadChunkSize } from '@/features/uploads/uploads.utils';

import { prepareLinkUpload } from '../server/public-share-actions';
import type { SharedItem } from '../server/public-share';
import {
  dropOffStep,
  uploadRefusal,
  type DropOffState,
  type ShareIdentity,
  type UploadRules,
  type UploadUsage,
} from '../shares.utils';
import { DepositorForm } from './depositor-form';

type SentFile =
  | { id: string; name: string; size: number; state: 'waiting' | 'done' }
  | { id: string; name: string; size: number; state: 'uploading'; sent: number }
  | { id: string; name: string; size: number; state: 'refused' | 'failed'; code: string };

interface LinkUploadProps {
  token: string;
  item: SharedItem;
  rules: UploadRules;
  usage: UploadUsage;
  identity: ShareIdentity;
  depositor: DropOffState | null;
}

/** Sends one file through the link; resolves to null when stored, or an error code. */
function send(file: File, endpoint: string, folder: string, onProgress: (sent: number) => void) {
  return new Promise<string | null>((resolve) => {
    const upload = new Upload(file, {
      endpoint,
      chunkSize: uploadChunkSize,
      retryDelays: [0, 1000, 3000],
      metadata: {
        destination: folder,
        filename: file.name,
        relativeDir: '',
        strategy: 'keep_both',
      },
      storeFingerprintForResuming: false,
      onProgress,
      onSuccess: () => {
        resolve(null);
      },
      onError: () => {
        resolve('shares.upload_failed');
      },
    });
    upload.start();
  });
}

/**
 * An upload link's page: visitors drop or pick files, each is checked against the link's rules,
 * then sent one after the other. They never see what the folder already holds.
 */
export function LinkUpload({
  token,
  item,
  rules,
  usage: initialUsage,
  identity,
  depositor: initialDepositor,
}: LinkUploadProps) {
  const t = useTranslations('shares.public');
  const format = useFormatter();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SentFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const usage = useRef<UploadUsage>({ ...initialUsage });
  const queue = useRef(Promise.resolve());
  const [depositor, setDepositor] = useState(initialDepositor);
  const step = dropOffStep(identity, depositor);

  const update = (id: string, next: SentFile) => {
    setFiles((current) => current.map((file) => (file.id === id ? next : file)));
  };

  const process = async (file: File, id: string) => {
    const base = { id, name: file.name, size: file.size };
    const refusal = uploadRefusal(rules, usage.current, file);
    if (refusal) {
      update(id, { ...base, state: 'refused', code: refusal });
      return;
    }
    const prepared = await prepareLinkUpload({ token, name: file.name, size: file.size });
    if (!prepared.ok) {
      update(id, { ...base, state: 'refused', code: prepared.error.code });
      return;
    }
    usage.current = {
      uploadedBytes: usage.current.uploadedBytes + file.size,
      uploadedFiles: usage.current.uploadedFiles + 1,
    };
    update(id, { ...base, state: 'uploading', sent: 0 });
    const failure = await send(file, prepared.data.endpoint, prepared.data.folder, (sent) => {
      update(id, { ...base, state: 'uploading', sent });
    });
    update(id, failure ? { ...base, state: 'failed', code: failure } : { ...base, state: 'done' });
  };

  const add = (picked: readonly File[]) => {
    const entries = picked.map((file) => ({ file, id: crypto.randomUUID() }));
    setFiles((current) => [
      ...current,
      ...entries.map(({ file, id }) => ({
        id,
        name: file.name,
        size: file.size,
        state: 'waiting' as const,
      })),
    ]);
    // One file at a time: each upload gets its own one-file ticket.
    for (const { file, id } of entries) {
      queue.current = queue.current.then(() => process(file, id));
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    add([...event.dataTransfer.files]);
  };

  const limits = [
    rules.allowedExtensions
      ? t('allowedTypes', { types: rules.allowedExtensions.map((ext) => `.${ext}`).join(', ') })
      : t('anyType'),
    ...(rules.maxFileBytes === null
      ? []
      : [t('maxFile', { size: formatBytes(rules.maxFileBytes, locale) })]),
    ...(rules.maxFiles === null
      ? []
      : [t('filesLeft', { count: Math.max(rules.maxFiles - initialUsage.uploadedFiles, 0) })]),
    ...(rules.maxTotalBytes === null
      ? []
      : [
          t('spaceLeft', {
            size: formatBytes(
              Math.max(rules.maxTotalBytes - initialUsage.uploadedBytes, 0),
              locale,
            ),
          }),
        ]),
  ];

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <FolderInput className="text-primary size-5 shrink-0" aria-hidden />
          <span className="truncate">{t('uploadTitle', { name: item.name })}</span>
        </CardTitle>
        <CardDescription>
          {t('uploadDescription', {
            date: format.dateTime(new Date(item.expiresAt), { dateStyle: 'medium' }),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {identity !== 'none' && step !== 'ready' && (
          <DepositorForm
            token={token}
            identity={identity}
            step={step}
            depositor={depositor}
            onChange={setDepositor}
          />
        )}
        {step === 'ready' && depositor?.email && (
          <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
            {depositor.verified && (
              <BadgeCheck className="text-primary size-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">
              {t('sendingAs', { name: depositor.name ?? '', email: depositor.email })}
            </span>
          </p>
        )}
        {step === 'ready' && (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => {
                setDragging(false);
              }}
              onDrop={onDrop}
              className={cn(
                'grid place-items-center gap-3 rounded-lg border border-dashed p-8 text-center',
                dragging && 'border-primary bg-primary/5',
              )}
            >
              <UploadIcon className="text-muted-foreground size-8" aria-hidden />
              <p className="text-sm">{t('dropHere')}</p>
              <Button
                type="button"
                onClick={() => {
                  input.current?.click();
                }}
              >
                {t('chooseFiles')}
              </Button>
              <input
                ref={input}
                type="file"
                multiple
                hidden
                accept={rules.allowedExtensions?.map((ext) => `.${ext}`).join(',')}
                onChange={(event) => {
                  add([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
            </div>
            <ul className="text-muted-foreground grid gap-0.5 text-xs">
              {limits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {files.length > 0 && (
          <ul className="divide-y rounded-lg border" aria-live="polite">
            {files.map((file) => (
              <li key={file.id} className="grid gap-1.5 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatBytes(file.size, locale)}
                  </span>
                  {file.state === 'done' && (
                    <CircleCheck className="text-primary size-4 shrink-0" aria-label={t('sent')} />
                  )}
                  {(file.state === 'refused' || file.state === 'failed') && (
                    <CircleAlert className="text-destructive size-4 shrink-0" aria-hidden />
                  )}
                </div>
                {file.state === 'uploading' && (
                  <Progress
                    value={file.size === 0 ? 100 : (file.sent / file.size) * 100}
                    aria-label={t('sending', { name: file.name })}
                  />
                )}
                {file.state === 'waiting' && (
                  <p className="text-muted-foreground text-xs">{t('waiting')}</p>
                )}
                {(file.state === 'refused' || file.state === 'failed') && (
                  <p className="text-destructive text-xs">{errorMessage(file.code)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
