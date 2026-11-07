'use client';

import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { useErrorMessage, useFormError } from '@/shared/errors/use-error-message';
import { formText } from '@/shared/lib/form';
import { useCan } from '@/shared/permissions/can';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { invalidFields } from '@/features/auth/auth.utils';

import { smtpFormSchema, testMailSchema, type SmtpForm } from './mail.utils';
import { saveSmtpSettings, sendTestEmail } from './server/mail-actions';
import type { OutboxItem } from './server/mail-store';
import { OutboxCard } from './ui/outbox-card';
import { SmtpCard, type SmtpValues } from './ui/smtp-card';

interface MailContainerProps {
  values: SmtpValues;
  passwordSet: boolean;
  locked: readonly string[];
  configured: boolean;
  outbox: readonly OutboxItem[];
}

export function MailContainer({
  values,
  passwordSet,
  locked,
  configured,
  outbox,
}: MailContainerProps) {
  const t = useTranslations('mail');
  const router = useRouter();
  const toFormError = useFormError();
  const errorMessage = useErrorMessage();
  const canEdit = useCan('mail:update');
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [testError, setTestError] = useState<FormErrorContent | null>(null);
  const [testInvalid, setTestInvalid] = useState(false);

  const save = (form: SmtpForm) => {
    const found = invalidFields(smtpFormSchema, form);
    setInvalid(found);
    if (found.size > 0) return;
    startSaving(async () => {
      const result = await saveSmtpSettings(form);
      setError(result.ok ? null : toFormError(result.error));
      if (!result.ok) return;
      toast.success(t('smtp.saved'));
      router.refresh();
    });
  };

  const sendTest = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const to = formText(new FormData(event.currentTarget), 'to');
    const bad = !testMailSchema.safeParse({ to }).success;
    setTestInvalid(bad);
    if (bad) return;
    startTesting(async () => {
      const result = await sendTestEmail({ to });
      setTestError(result.ok ? null : toFormError(result.error));
      if (result.ok) toast.success(t('test.sent'));
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6">
      <SmtpCard
        values={values}
        passwordSet={passwordSet}
        locked={new Set(locked)}
        configured={configured}
        canEdit={canEdit}
        pending={saving}
        invalidFields={invalid}
        error={error}
        onSubmit={save}
      />
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{t('test.title')}</CardTitle>
            <CardDescription>{t('test.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={sendTest}
              noValidate
              aria-busy={testing}
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              {testError && (
                <div className="sm:col-span-2">
                  <FormError error={testError} />
                </div>
              )}
              <Field data-invalid={testInvalid || undefined}>
                <FieldLabel htmlFor="test-to">{t('test.to')}</FieldLabel>
                <Input
                  id="test-to"
                  name="to"
                  type="email"
                  aria-invalid={testInvalid || undefined}
                />
                {testInvalid && <FieldError>{t('test.error')}</FieldError>}
              </Field>
              <Button type="submit" disabled={testing}>
                {testing ? <Spinner /> : <Send aria-hidden data-icon="inline-start" />}
                {t('test.send')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <OutboxCard
        rows={outbox.map((row) => ({
          ...row,
          error: row.lastError ? errorMessage(row.lastError) : null,
        }))}
      />
    </div>
  );
}
