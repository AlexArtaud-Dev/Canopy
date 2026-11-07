'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { formText } from '@/shared/lib/form';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Spinner } from '@/shared/ui/spinner';

import { passwordSchema } from './auth.utils';
import { requestPasswordReset, setPasswordWithToken } from './server/password-links';

/** "Forgot password": same confirmation whether or not an account matched. */
export function ForgotPasswordContainer() {
  const t = useTranslations('auth.forgot');
  const toFormError = useFormError();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = formText(new FormData(event.currentTarget), 'identifier');
    startTransition(async () => {
      const result = await requestPasswordReset({ identifier });
      setError(result.ok ? null : toFormError(result.error));
      setSent(result.ok);
    });
  };

  if (sent) {
    return (
      <div className="grid gap-4">
        <Alert>
          <CircleCheck aria-hidden />
          <AlertDescription>{t('sent')}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/login">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        <Field>
          <FieldLabel htmlFor="identifier">{t('identifier')}</FieldLabel>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t('submit')}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">{t('back')}</Link>
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Choosing a password from an invitation or reset link. */
export function SetPasswordContainer({
  token,
  passwordMinLength,
}: {
  token: string;
  passwordMinLength: number;
}) {
  const t = useTranslations('auth.setPassword');
  const toFormError = useFormError();
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState<'password' | 'confirm' | null>(null);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = formText(form, 'password');
    const confirmPassword = formText(form, 'confirmPassword');
    if (!passwordSchema(passwordMinLength).safeParse(password).success) {
      setInvalid('password');
      return;
    }
    if (password !== confirmPassword) {
      setInvalid('confirm');
      return;
    }
    setInvalid(null);
    startTransition(async () => {
      const result = await setPasswordWithToken({ token, password, confirmPassword });
      setError(result.ok ? null : toFormError(result.error));
      setDone(result.ok);
    });
  };

  if (done) {
    return (
      <div className="grid gap-4">
        <Alert>
          <CircleCheck aria-hidden />
          <AlertDescription>{t('done')}</AlertDescription>
        </Alert>
        <Button asChild size="lg">
          <Link href="/login">{t('submit')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        <Field data-invalid={invalid === 'password' || undefined}>
          <FieldLabel htmlFor="new-password">{t('password')}</FieldLabel>
          <PasswordInput
            id="new-password"
            name="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={invalid === 'password' || undefined}
          />
          {invalid === 'password' && (
            <FieldError>{t('errors.password', { min: passwordMinLength })}</FieldError>
          )}
        </Field>
        <Field data-invalid={invalid === 'confirm' || undefined}>
          <FieldLabel htmlFor="confirm-password">{t('confirm')}</FieldLabel>
          <PasswordInput
            id="confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            aria-invalid={invalid === 'confirm' || undefined}
          />
          {invalid === 'confirm' && <FieldError>{t('errors.confirm')}</FieldError>}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t('submit')}
        </Button>
      </FieldGroup>
    </form>
  );
}
