'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import type { EntryProperties } from '@canopy/contracts';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';

import { fileKind, formatBytes } from '../../browser.utils';
import { formatOctal } from '../../properties.utils';
import { loadEntryProperties } from '../../server/properties';
import { EntryIcon } from '../entry-icon';
import { CopyButton, Row } from './properties-row';
import { ChecksumRow, FolderSizeRow, ImageRows, VideoRows } from './properties-sections';

interface PropertiesDialogProps {
  /** The entry described, or null when the dialog is closed. */
  path: string | null;
  onClose: () => void;
}

/** Everything Canopy and the host know about one file or folder. */
export function PropertiesDialog({ path, onClose }: PropertiesDialogProps) {
  const t = useTranslations('files.properties');
  const errorMessage = useErrorMessage();
  const query = useQuery({
    queryKey: ['files', 'properties', path],
    queryFn: async () => {
      const result = await loadEntryProperties({ path });
      if (!result.ok) throw new Error(errorMessage(result.error.code, result.error.params));
      return result.data;
    },
    enabled: path !== null,
    staleTime: 0,
    retry: false,
  });

  return (
    <Dialog
      open={path !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            {query.data && (
              <EntryIcon
                kind={fileKind(query.data.entry.name, query.data.entry.kind === 'directory')}
                className="size-5 shrink-0"
              />
            )}
            <span className="truncate">{query.data?.entry.name ?? t('title')}</span>
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <div className="grid h-40 place-items-center">
            <Spinner className="size-6" />
          </div>
        ) : query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {query.error.message}
          </p>
        ) : (
          <PropertiesList properties={query.data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PropertiesList({ properties }: { properties: EntryProperties }) {
  const t = useTranslations('files.properties');
  const actionT = useTranslations('files.grants.actionNames');
  const format = useFormatter();
  const locale = useLocale();
  const { entry } = properties;
  const isFolder = entry.kind === 'directory';
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeStyle: 'medium' });

  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-3 text-sm">
      <Row label={t('location')}>
        <span className="flex min-w-0 items-start gap-1">
          <span className="font-mono text-xs break-all">{entry.path}</span>
          <CopyButton value={entry.path} label={t('copyPath')} />
        </span>
      </Row>
      <Row label={t('type')}>
        {isFolder ? t('folder') : (properties.mimeType ?? t('file'))}
        {properties.link && (
          <span className="text-muted-foreground block text-xs">
            {properties.linkTarget
              ? t('linkTo', { target: properties.linkTarget })
              : t('linkOutside')}
          </span>
        )}
      </Row>
      {isFolder ? (
        <FolderSizeRow path={entry.path} />
      ) : (
        <Row label={t('size')}>
          {formatBytes(entry.size, locale)}
          <span className="text-muted-foreground ml-1 text-xs">
            {t('bytes', { count: entry.size })}
          </span>
        </Row>
      )}
      <Row label={t('modified')}>{date(entry.modified)}</Row>
      {properties.changed && <Row label={t('changed')}>{date(properties.changed)}</Row>}
      {properties.uid !== undefined && (
        <Row label={t('owner')}>
          <span className="font-mono text-xs">
            {t('ownerIds', { uid: properties.uid, gid: properties.gid ?? 0 })}
          </span>
        </Row>
      )}
      <Row label={t('permissions')}>
        <span className="font-mono text-xs">
          {properties.mode} ({formatOctal(properties.permissions)})
        </span>
      </Row>
      <Row label={t('access')}>
        {entry.actions.length === 0 ? (
          <span className="text-muted-foreground">{t('noAccess')}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {entry.actions.map((action) => (
              <Badge key={action} variant="secondary">
                {/* i18n-dynamic: files.grants.actionNames */}
                {actionT(action)}
              </Badge>
            ))}
          </span>
        )}
      </Row>
      {entry.preview === 'video' && entry.actions.includes('download') && (
        <VideoRows path={entry.path} modified={entry.modified} />
      )}
      {entry.preview === 'image' && entry.actions.includes('download') && (
        <ImageRows path={entry.path} />
      )}
      {!isFolder && entry.actions.includes('download') && <ChecksumRow path={entry.path} />}
    </dl>
  );
}
