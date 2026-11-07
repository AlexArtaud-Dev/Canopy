'use client';

import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { formText } from '@/shared/lib/form';
import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { Button } from '@/shared/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from '@/shared/ui/password-input';

export interface Credentials {
  username: string;
  password: string;
}

interface LoginFormProps {
  pending: boolean;
  /** Set when the last attempt failed. */
  error: FormErrorContent | null;
  onSubmit: (credentials: Credentials) => void;
}

export function LoginForm({ pending, error, onSubmit }: LoginFormProps) {
  const t = useTranslations('auth.login');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      username: formText(form, 'username'),
      password: formText(form, 'password'),
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError title={t('failed')} error={error} />}
        <Field>
          <FieldLabel htmlFor="username">{t('username')}</FieldLabel>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t('submit')}
        </Button>
      </FieldGroup>
    </form>
  );
}
