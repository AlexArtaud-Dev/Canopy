'use client';

import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type SubmitEvent } from 'react';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { CodeInput } from '@/features/auth/ui/code-input';

import { confirmDepositor, declareDepositor } from '../server/public-share-actions';
import type { DropOffState, DropOffStep, ShareIdentity } from '../shares.utils';

interface DepositorFormProps {
  token: string;
  identity: Exclude<ShareIdentity, 'none'>;
  step: Exclude<DropOffStep, 'ready'>;
  depositor: DropOffState | null;
  onChange: (depositor: DropOffState) => void;
}

/**
 * Before sending files through a link that asks: the depositor's name and e-mail, then, when the
 * link verifies e-mails, the code sent to it.
 */
export function DepositorForm({ token, identity, step, depositor, onChange }: DepositorFormProps) {
  const t = useTranslations('shares.public.depositor');
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [name, setName] = useState(depositor?.name ?? '');
  const [email, setEmail] = useState(depositor?.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const declare = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();
    startTransition(async () => {
      const result = await declareDepositor({ token, name, email });
      if (!result.ok) {
        setError(errorMessage(result.error.code, result.error.params));
        return;
      }
      setError(null);
      setCode('');
      onChange(result.data);
    });
  };

  const confirm = (value: string) => {
    startTransition(async () => {
      const result = await confirmDepositor({ token, code: value });
      if (!result.ok) {
        setError(errorMessage(result.error.code, result.error.params));
        setCode('');
        return;
      }
      setError(null);
      onChange(result.data);
    });
  };

  if (step === 'code') {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <MailCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">{t('codeSent', { email: depositor?.email ?? email })}</p>
        </div>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={`${formId}-code`}>{t('code')}</FieldLabel>
          <CodeInput
            id={`${formId}-code`}
            name="code"
            value={code}
            onChange={setCode}
            onComplete={confirm}
            invalid={error !== null}
            disabled={pending}
            autoFocus
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || code.length < 6}
            aria-busy={pending}
            onClick={() => {
              confirm(code);
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {t('confirm')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              declare();
            }}
          >
            {t('resend')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={declare}>
      <p className="text-sm">{identity === 'verified' ? t('introVerified') : t('intro')}</p>
      <Field>
        <FieldLabel htmlFor={`${formId}-name`}>{t('name')}</FieldLabel>
        <Input
          id={`${formId}-name`}
          value={name}
          required
          maxLength={120}
          autoComplete="name"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={`${formId}-email`}>{t('email')}</FieldLabel>
        <Input
          id={`${formId}-email`}
          type="email"
          value={email}
          required
          maxLength={254}
          autoComplete="email"
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <FieldDescription>{t('privacy')}</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending} className="justify-self-start">
        {pending && <Spinner data-icon="inline-start" />}
        {identity === 'verified' ? t('sendCode') : t('continue')}
      </Button>
    </form>
  );
}
