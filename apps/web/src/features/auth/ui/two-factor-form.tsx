'use client';

import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

interface TwoFactorFormProps {
  pending: boolean;
  error: FormErrorContent | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

export function TwoFactorForm({ pending, error, onSubmit, onCancel }: TwoFactorFormProps) {
  const t = useTranslations('auth.twoFactor');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(formText(new FormData(event.currentTarget), 'code'));
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        <Field>
          <FieldLabel htmlFor="code">{t('code')}</FieldLabel>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus
            className="font-mono tracking-widest"
            aria-invalid={error ? true : undefined}
            aria-describedby="code-description"
          />
          <FieldDescription id="code-description">{t('codeHint')}</FieldDescription>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t('submit')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </FieldGroup>
    </form>
  );
}
