'use client';

import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { PasswordInput } from '@/shared/ui/password-input';
import { Spinner } from '@/shared/ui/spinner';

interface ResetPasswordDialogProps {
  name: string | null;
  passwordMinLength: number;
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (values: { password: string; confirmPassword: string }) => void;
  onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({
  name,
  passwordMinLength,
  pending,
  invalidFields,
  error,
  onSubmit,
  onOpenChange,
}: ResetPasswordDialogProps) {
  const t = useTranslations('users');
  const invalid = (field: string) => invalidFields.has(field) || undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      password: formText(form, 'password'),
      confirmPassword: formText(form, 'confirmPassword'),
    });
  };

  return (
    <Dialog open={name !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('resetPassword.title', { name: name ?? '' })}</DialogTitle>
            <DialogDescription>{t('resetPassword.description')}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field data-invalid={invalid('password')}>
              <FieldLabel htmlFor="reset-password">{t('form.password')}</FieldLabel>
              <PasswordInput
                id="reset-password"
                name="password"
                autoComplete="new-password"
                autoFocus
                aria-invalid={invalid('password')}
              />
              {invalid('password') && (
                <FieldError>{t('form.errors.password', { min: passwordMinLength })}</FieldError>
              )}
            </Field>
            <Field data-invalid={invalid('confirmPassword')}>
              <FieldLabel htmlFor="reset-confirmPassword">{t('form.confirmPassword')}</FieldLabel>
              <PasswordInput
                id="reset-confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                aria-invalid={invalid('confirmPassword')}
              />
              {invalid('confirmPassword') && (
                <FieldError>{t('form.errors.confirmPassword')}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {t('resetPassword.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
