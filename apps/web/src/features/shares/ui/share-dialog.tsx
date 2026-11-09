'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Link2 } from 'lucide-react';
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

import { createShare, loadShareOptions, type ShareOptions } from '../server/share-actions';
import { defaultExpiry, expiryOptions, sharePasswordMaxLength } from '../shares.utils';

interface ShareDialogProps {
  /** The item to share, or null when closed. */
  target: { path: string; name: string } | null;
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
  options: ShareOptions;
  onClose: () => void;
}

function ShareForm({ path, options, onClose }: ShareFormProps) {
  const t = useTranslations('shares.dialog');
  const toFormError = useFormError();
  const [days, setDays] = useState(defaultExpiry(options.defaultExpiryDays, options.maxExpiryDays));
  const [password, setPassword] = useState('');
  const [limited, setLimited] = useState(false);
  const [limit, setLimit] = useState('10');
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const maxDownloads = limited ? Number.parseInt(limit, 10) : null;
  const valid =
    (!options.requirePassword || password !== '') &&
    (maxDownloads === null || (Number.isInteger(maxDownloads) && maxDownloads >= 1));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    startTransition(async () => {
      const result = await createShare({ path, expiresInDays: days, password, maxDownloads });
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
