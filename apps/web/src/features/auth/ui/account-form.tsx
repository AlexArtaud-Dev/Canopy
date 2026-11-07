'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { formText } from '@/shared/lib/form';
import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from './password-input';

export const accountFields = [
  'username',
  'displayName',
  'contactEmail',
  'password',
  'confirmPassword',
] as const;
export type AccountField = (typeof accountFields)[number];
export type AccountValues = Record<AccountField, string>;

interface AccountFormProps {
  pending: boolean;
  /** Fields that failed validation; their translated hint is shown under them. */
  invalidFields: ReadonlySet<AccountField>;
  /** Set when the last submission failed. */
  error: FormErrorContent | null;
  onSubmit: (values: AccountValues) => void;
  onBack: () => void;
}

export function AccountForm({ pending, invalidFields, error, onSubmit, onBack }: AccountFormProps) {
  const t = useTranslations('auth.setup.account');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (field: AccountField) => formText(form, field);
    onSubmit({
      username: read('username'),
      displayName: read('displayName'),
      contactEmail: read('contactEmail'),
      password: read('password'),
      confirmPassword: read('confirmPassword'),
    });
  };

  const invalid = (field: AccountField) => invalidFields.has(field);
  const describedBy = (field: AccountField) => `${field}-description`;

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        <Field data-invalid={invalid('username') || undefined}>
          <FieldLabel htmlFor="username">{t('username')}</FieldLabel>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            aria-invalid={invalid('username') || undefined}
            aria-describedby={describedBy('username')}
          />
          {invalid('username') ? (
            <FieldError id={describedBy('username')}>{t('errors.username')}</FieldError>
          ) : (
            <FieldDescription id={describedBy('username')}>{t('usernameHint')}</FieldDescription>
          )}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={invalid('displayName') || undefined}>
            <FieldLabel htmlFor="displayName">{t('displayName')}</FieldLabel>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="name"
              aria-invalid={invalid('displayName') || undefined}
              aria-describedby={describedBy('displayName')}
            />
            {invalid('displayName') ? (
              <FieldError id={describedBy('displayName')}>{t('errors.displayName')}</FieldError>
            ) : (
              <FieldDescription id={describedBy('displayName')}>
                {t('displayNameHint')}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={invalid('contactEmail') || undefined}>
            <FieldLabel htmlFor="contactEmail">{t('contactEmail')}</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              aria-invalid={invalid('contactEmail') || undefined}
              aria-describedby={describedBy('contactEmail')}
            />
            {invalid('contactEmail') ? (
              <FieldError id={describedBy('contactEmail')}>{t('errors.contactEmail')}</FieldError>
            ) : (
              <FieldDescription id={describedBy('contactEmail')}>
                {t('contactEmailHint')}
              </FieldDescription>
            )}
          </Field>
        </div>
        <Field data-invalid={invalid('password') || undefined}>
          <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            aria-invalid={invalid('password') || undefined}
            aria-describedby={describedBy('password')}
          />
          {invalid('password') ? (
            <FieldError id={describedBy('password')}>{t('errors.password')}</FieldError>
          ) : (
            <FieldDescription id={describedBy('password')}>{t('passwordHint')}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={invalid('confirmPassword') || undefined}>
          <FieldLabel htmlFor="confirmPassword">{t('confirmPassword')}</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            aria-invalid={invalid('confirmPassword') || undefined}
            aria-describedby={describedBy('confirmPassword')}
          />
          {invalid('confirmPassword') && (
            <FieldError id={describedBy('confirmPassword')}>
              {t('errors.confirmPassword')}
            </FieldError>
          )}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={pending}>
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t('back')}
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Spinner />}
            {t('submit')}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
