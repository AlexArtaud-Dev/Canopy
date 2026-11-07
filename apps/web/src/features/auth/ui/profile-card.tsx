'use client';

import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

export interface ProfileValues {
  displayName: string;
  contactEmail: string;
}

interface ProfileCardProps {
  username: string;
  values: ProfileValues;
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (values: ProfileValues) => void;
}

export function ProfileCard({
  username,
  values,
  pending,
  invalidFields,
  error,
  onSubmit,
}: ProfileCardProps) {
  const t = useTranslations('auth.profile');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      displayName: formText(form, 'displayName'),
      contactEmail: formText(form, 'contactEmail'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field>
              <FieldLabel htmlFor="profile-username">{t('username')}</FieldLabel>
              <Input id="profile-username" value={username} readOnly disabled />
              <FieldDescription>{t('usernameHint')}</FieldDescription>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={invalidFields.has('displayName') || undefined}>
                <FieldLabel htmlFor="displayName">{t('displayName')}</FieldLabel>
                <Input
                  id="displayName"
                  name="displayName"
                  autoComplete="name"
                  defaultValue={values.displayName}
                  aria-invalid={invalidFields.has('displayName') || undefined}
                />
                {invalidFields.has('displayName') && (
                  <FieldError>{t('errors.displayName')}</FieldError>
                )}
              </Field>
              <Field data-invalid={invalidFields.has('contactEmail') || undefined}>
                <FieldLabel htmlFor="contactEmail">{t('contactEmail')}</FieldLabel>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  autoComplete="email"
                  defaultValue={values.contactEmail}
                  aria-invalid={invalidFields.has('contactEmail') || undefined}
                />
                {invalidFields.has('contactEmail') ? (
                  <FieldError>{t('errors.contactEmail')}</FieldError>
                ) : (
                  <FieldDescription>{t('contactEmailHint')}</FieldDescription>
                )}
              </Field>
            </div>
            <Button type="submit" className="w-fit" disabled={pending}>
              {pending && <Spinner />}
              {t('save')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
