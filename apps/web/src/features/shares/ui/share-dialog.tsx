'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, Link2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { createShare, loadShareOptions, type ShareOptions } from '../server/share-actions';
import { defaultExpiry, expiryOptions, sharePasswordMaxLength } from '../shares.utils';

interface ShareDialogProps {
  /** The item to share, or null when closed. */
  target: { path: string; name: string; isDirectory: boolean; actions: readonly string[] } | null;
  onClose: () => void;
}

/** Creates a link to a file or folder, then shows it ready to copy. */
export function ShareDialog({ target, onClose }: ShareDialogProps) {
  const t = useTranslations('shares.dialog');
  const options = useQuery({
    queryKey: ['shares', 'options'],
    queryFn: async () => {
      const result = await loadShareOptions();
      if (!result.ok) throw new Error(result.error.code);
      return result.data;
    },
    enabled: target !== null,
  });
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: target?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {target && options.data ? (
          <ShareForm
            key={target.path}
            path={target.path}
            canReceive={target.isDirectory && target.actions.includes('upload')}
            options={options.data}
            onClose={onClose}
          />
        ) : (
          <div className="grid place-items-center py-8">
            <Spinner className="size-5" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ShareFormProps {
  path: string;
  /** Folders the person may upload into can also get an upload link. */
  canReceive: boolean;
  options: ShareOptions;
  onClose: () => void;
}

/** A typed limit: a positive whole number, or empty for no limit. */
function limitOf(typed: string): number | null | undefined {
  if (typed.trim() === '') return null;
  const value = Number(typed);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

function ShareForm({ path, canReceive, options, onClose }: ShareFormProps) {
  const t = useTranslations('shares.dialog');
  const toFormError = useFormError();
  const [days, setDays] = useState(defaultExpiry(options.defaultExpiryDays, options.maxExpiryDays));
  const [password, setPassword] = useState('');
  const [limited, setLimited] = useState(false);
  const [limit, setLimit] = useState('10');
  const [kind, setKind] = useState<'download' | 'upload'>('download');
  const [extensions, setExtensions] = useState('');
  const [maxFileMb, setMaxFileMb] = useState('');
  const [maxTotalMb, setMaxTotalMb] = useState('');
  const [maxFiles, setMaxFiles] = useState('');
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const maxDownloads = limited && kind === 'download' ? Number.parseInt(limit, 10) : null;
  const upload = {
    extensions,
    maxFileMb: limitOf(maxFileMb),
    maxTotalMb: limitOf(maxTotalMb),
    maxFiles: limitOf(maxFiles),
  };
  const valid =
    (!options.requirePassword || password !== '') &&
    (maxDownloads === null || (Number.isInteger(maxDownloads) && maxDownloads >= 1)) &&
    (kind === 'download' ||
      (upload.maxFileMb !== undefined &&
        upload.maxTotalMb !== undefined &&
        upload.maxFiles !== undefined));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    startTransition(async () => {
      const result = await createShare({
        path,
        kind,
        expiresInDays: days,
        password,
        maxDownloads,
        upload,
      });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      setError(null);
      setLink(result.data.link);
    });
  };

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(t('copied'));
    });
  };

  if (link) {
    return (
      <div className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="share-link">{t('link')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="share-link"
              value={link}
              readOnly
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                copy(link);
              }}
            >
              {copied ? (
                <Check aria-hidden data-icon="inline-start" />
              ) : (
                <Copy aria-hidden data-icon="inline-start" />
              )}
              {t('copy')}
            </Button>
          </div>
          <FieldDescription>{t('linkHint')}</FieldDescription>
        </Field>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('done')}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && <FormError error={error} />}
      {canReceive && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(value) => {
            if (value === 'download' || value === 'upload') setKind(value);
          }}
          className="w-full"
        >
          <ToggleGroupItem value="download" className="flex-1">
            <Download aria-hidden />
            {t('kindDownload')}
          </ToggleGroupItem>
          <ToggleGroupItem value="upload" className="flex-1">
            <Upload aria-hidden />
            {t('kindUpload')}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      {kind === 'upload' && (
        <>
          <FieldDescription>{t('uploadHint')}</FieldDescription>
          <Field>
            <FieldLabel htmlFor="share-types">{t('types')}</FieldLabel>
            <Input
              id="share-types"
              value={extensions}
              maxLength={500}
              placeholder={t('typesPlaceholder')}
              onChange={(event) => {
                setExtensions(event.target.value);
              }}
            />
            <FieldDescription>{t('typesHint')}</FieldDescription>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="share-max-file">{t('maxFileMb')}</FieldLabel>
              <Input
                id="share-max-file"
                type="number"
                min={1}
                value={maxFileMb}
                placeholder={t('noLimit')}
                onChange={(event) => {
                  setMaxFileMb(event.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="share-max-total">{t('maxTotalMb')}</FieldLabel>
              <Input
                id="share-max-total"
                type="number"
                min={1}
                value={maxTotalMb}
                placeholder={t('noLimit')}
                onChange={(event) => {
                  setMaxTotalMb(event.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="share-max-files">{t('maxFiles')}</FieldLabel>
              <Input
                id="share-max-files"
                type="number"
                min={1}
                value={maxFiles}
                placeholder={t('noLimit')}
                onChange={(event) => {
                  setMaxFiles(event.target.value);
                }}
              />
            </Field>
          </div>
        </>
      )}
      <Field>
        <FieldLabel htmlFor="share-expiry">{t('expiry')}</FieldLabel>
        <Select
          value={String(days)}
          onValueChange={(value) => {
            setDays(Number(value));
          }}
        >
          <SelectTrigger id="share-expiry" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expiryOptions(options.maxExpiryDays).map((option) => (
              <SelectItem key={option} value={String(option)}>
                {t('days', { count: option })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="share-password">
          {options.requirePassword ? t('password') : t('passwordOptional')}
        </FieldLabel>
        <PasswordInput
          id="share-password"
          value={password}
          maxLength={sharePasswordMaxLength}
          autoComplete="new-password"
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <FieldDescription>{t('passwordHint')}</FieldDescription>
      </Field>
      {kind === 'download' && (
        <Field orientation="horizontal">
          <Checkbox
            id="share-limited"
            checked={limited}
            onCheckedChange={(checked) => {
              setLimited(checked === true);
            }}
          />
          <FieldLabel htmlFor="share-limited">{t('limit')}</FieldLabel>
          {limited && (
            <Input
              type="number"
              min={1}
              max={1_000_000}
              className="w-24"
              aria-label={t('limitCount')}
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
              }}
            />
          )}
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!valid || pending} aria-busy={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Link2 aria-hidden data-icon="inline-start" />
          )}
          {t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
