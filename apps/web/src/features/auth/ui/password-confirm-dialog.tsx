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
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from './password-input';

interface PasswordConfirmDialogProps {
  open: boolean;
  description: string;
  destructive?: boolean;
  pending: boolean;
  error: FormErrorContent | null;
  onConfirm: (password: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Step-up confirmation for sensitive account changes. */
export function PasswordConfirmDialog({
  open,
  description,
  destructive = false,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: PasswordConfirmDialogProps) {
  const t = useTranslations('auth.totp');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConfirm(formText(new FormData(event.currentTarget), 'password'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field>
              <FieldLabel htmlFor="confirm-password">{t('password')}</FieldLabel>
              <PasswordInput
                id="confirm-password"
                name="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending && <Spinner />}
              {t('confirmAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
