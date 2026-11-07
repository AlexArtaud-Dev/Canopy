'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { RecoveryCodes } from './recovery-codes';

export type TotpView =
  | { kind: 'off' }
  | { kind: 'enrolling'; qrCode: string; secret: string }
  | { kind: 'codes'; codes: readonly string[] }
  | { kind: 'on'; remainingCodes: number };

interface TotpCardProps {
  view: TotpView;
  pending: boolean;
  error: FormErrorContent | null;
  onStart: () => void;
  onConfirm: (code: string) => void;
  onCancel: () => void;
  onCopyCodes: () => void;
  onDownloadCodes: () => void;
  onCodesSaved: () => void;
  onRegenerate: () => void;
  onDisable: () => void;
}

export function TotpCard(props: TotpCardProps) {
  const t = useTranslations('auth.totp');
  const { view } = props;
  const enabled = view.kind === 'on' || view.kind === 'codes';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-muted-foreground size-4" aria-hidden />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? t('on') : t('off')}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <TotpBody {...props} />
      </CardContent>
    </Card>
  );
}

function TotpBody({
  view,
  pending,
  error,
  onStart,
  onConfirm,
  onCancel,
  onCopyCodes,
  onDownloadCodes,
  onCodesSaved,
  onRegenerate,
  onDisable,
}: TotpCardProps) {
  const t = useTranslations('auth.totp');

  if (view.kind === 'codes') {
    return (
      <RecoveryCodes
        codes={view.codes}
        onCopy={onCopyCodes}
        onDownload={onDownloadCodes}
        onDone={onCodesSaved}
      />
    );
  }

  if (view.kind === 'on') {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-muted-foreground text-sm">
          {t('remaining', { count: view.remainingCodes })}
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={onRegenerate}>
            {t('regenerate')}
          </Button>
          <Button variant="destructive" onClick={onDisable}>
            {t('disable')}
          </Button>
        </div>
      </div>
    );
  }

  if (view.kind === 'enrolling') {
    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      onConfirm(formText(new FormData(event.currentTarget), 'code'));
    };
    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        className="grid gap-6 sm:grid-cols-[auto_1fr]"
      >
        {/* Generated server-side as a data URL; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={view.qrCode}
          alt=""
          width={208}
          height={208}
          className="mx-auto rounded-lg border"
        />
        <FieldGroup>
          <p className="text-sm">{t('scan')}</p>
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs">{t('manual')}</p>
            <code className="bg-muted rounded px-2 py-1 font-mono text-xs break-all select-all">
              {view.secret}
            </code>
          </div>
          {error && <FormError error={error} />}
          <Field>
            <FieldLabel htmlFor="totp-code">{t('code')}</FieldLabel>
            <Input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              className="font-mono tracking-widest"
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending} className="ml-auto">
              {pending && <Spinner />}
              {t('confirm')}
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  return (
    <div className="grid gap-3">
      {error && <FormError error={error} />}
      <Button className="w-fit" onClick={onStart} disabled={pending}>
        {pending && <Spinner />}
        {t('setUp')}
      </Button>
    </div>
  );
}
