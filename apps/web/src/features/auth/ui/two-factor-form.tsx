'use client';

import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { appCodeLength, CodeInput } from './code-input';

interface TwoFactorFormProps {
  pending: boolean;
  error: FormErrorContent | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

/** The second sign-in step: the app's 6 digits (sent as soon as typed), or a recovery code. */
export function TwoFactorForm({ pending, error, onSubmit, onCancel }: TwoFactorFormProps) {
  const t = useTranslations('auth.twoFactor');
  const [mode, setMode] = useState<'app' | 'recovery'>('app');
  const [code, setCode] = useState('');
  // A refused code empties the boxes, ready for the next one (adjusting state while rendering).
  const [shownError, setShownError] = useState(error);
  if (error !== shownError) {
    setShownError(error);
    if (error) setCode('');
  }

  const submit = (value: string) => {
    if (!pending) onSubmit(value);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(mode === 'app' ? code : formText(new FormData(event.currentTarget), 'code'));
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        {mode === 'app' ? (
          <Field className="items-center">
            <FieldLabel htmlFor="code" className="mx-auto">
              {t('code')}
            </FieldLabel>
            <div className="flex justify-center">
              <CodeInput
                id="code"
                name="code"
                value={code}
                onChange={setCode}
                onComplete={submit}
                invalid={error !== null}
                autoFocus
                describedBy="code-description"
              />
            </div>
            <FieldDescription id="code-description" className="text-center">
              {t('codeHint')}
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="code">{t('recoveryCode')}</FieldLabel>
            <Input
              id="code"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              autoFocus
              className="font-mono tracking-widest"
              aria-invalid={error ? true : undefined}
              aria-describedby="code-description"
            />
            <FieldDescription id="code-description">{t('recoveryHint')}</FieldDescription>
          </Field>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending || (mode === 'app' && code.length < appCodeLength)}
        >
          {pending && <Spinner />}
          {t('submit')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => {
            setMode(mode === 'app' ? 'recovery' : 'app');
            setCode('');
          }}
        >
          {mode === 'app' ? t('useRecovery') : t('useApp')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </FieldGroup>
    </form>
  );
}
