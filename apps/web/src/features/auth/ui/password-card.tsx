'use client';

import { useTranslations } from 'next-intl';
import { useRef, type SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from './password-input';

export interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordCardProps {
  passwordMinLength: number;
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  /** Resolves true on success so the form can clear itself. */
  onSubmit: (values: PasswordValues) => Promise<boolean>;
}

export function PasswordCard({
  passwordMinLength,
  pending,
  invalidFields,
  error,
  onSubmit,
}: PasswordCardProps) {
  const t = useTranslations('auth.passwordChange');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSubmit({
      currentPassword: formText(form, 'currentPassword'),
      newPassword: formText(form, 'newPassword'),
      confirmPassword: formText(form, 'confirmPassword'),
    }).then((done) => {
      if (done) formRef.current?.reset();
    });
  };

  const invalid = (field: string) => invalidFields.has(field) || undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={pending}>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field data-invalid={invalid('currentPassword')}>
              <FieldLabel htmlFor="currentPassword">{t('current')}</FieldLabel>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                aria-invalid={invalid('currentPassword')}
              />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={invalid('newPassword')}>
                <FieldLabel htmlFor="newPassword">{t('new')}</FieldLabel>
                <PasswordInput
                  id="newPassword"
                  name="newPassword"
                  autoComplete="new-password"
                  aria-invalid={invalid('newPassword')}
                />
                {invalid('newPassword') ? (
                  <FieldError>{t('errors.newPassword', { min: passwordMinLength })}</FieldError>
                ) : (
                  <FieldDescription>{t('hint', { min: passwordMinLength })}</FieldDescription>
                )}
              </Field>
              <Field data-invalid={invalid('confirmPassword')}>
                <FieldLabel htmlFor="confirmPassword">{t('confirm')}</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  aria-invalid={invalid('confirmPassword')}
                />
                {invalid('confirmPassword') && (
                  <FieldError>{t('errors.confirmPassword')}</FieldError>
                )}
              </Field>
            </div>
            <Button type="submit" className="w-fit" disabled={pending}>
              {pending && <Spinner />}
              {t('submit')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
