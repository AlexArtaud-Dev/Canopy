'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Stepper } from '@/shared/ui/stepper';
import { usePreferences } from '@/features/shell';

import { invalidAccountFields } from './auth.utils';
import { completeSetup } from './server/setup';
import {
  AccountForm,
  accountFields,
  type AccountField,
  type AccountValues,
} from './ui/account-form';
import { SetupDone } from './ui/setup-done';
import { SetupWelcome } from './ui/setup-welcome';

const steps = ['welcome', 'account', 'done'] as const;
type Step = (typeof steps)[number];

/** `done` renders the confirmation once the account exists (see `completeSetup`). */
export function SetupContainer({ initialStep = 'welcome' }: { initialStep?: Step }) {
  const t = useTranslations('auth.setup');
  const router = useRouter();
  const preferences = usePreferences();
  const toFormError = useFormError();
  const [step, setStep] = useState<Step>(initialStep);
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<AccountField>>(new Set());
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();
  const current = steps.indexOf(step);

  const handleSubmit = (values: AccountValues) => {
    const invalid = invalidAccountFields(values);
    setInvalidFields(new Set(accountFields.filter((field) => invalid.has(field))));
    if (invalid.size > 0) return;
    startTransition(async () => {
      const result = await completeSetup(values);
      // On success the action redirects to the confirmation step.
      if (!result.ok) {
        setError(toFormError(result.error));
      }
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="gap-6">
        <Stepper
          label={t('steps.label')}
          // The confirmation shows every step completed.
          current={step === 'done' ? steps.length : current}
          steps={steps.map((id) => ({ id, label: t(`steps.${id}`) }))}
        />
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('stepCounter', { current: current + 1, total: steps.length })}
          </p>
          <CardTitle className="text-xl">
            <h1>{t(`${step}.title`)}</h1>
          </CardTitle>
          <CardDescription>{t(`${step}.description`)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {step === 'welcome' && (
          <SetupWelcome
            locale={preferences.locale}
            theme={preferences.theme}
            pending={preferences.pending}
            onLocaleChange={preferences.changeLocale}
            onThemeChange={preferences.changeTheme}
            onNext={() => {
              setStep('account');
            }}
          />
        )}
        {step === 'account' && (
          <AccountForm
            pending={pending}
            invalidFields={invalidFields}
            error={error}
            onSubmit={handleSubmit}
            onBack={() => {
              setStep('welcome');
            }}
          />
        )}
        {step === 'done' && (
          <SetupDone
            onOpen={() => {
              router.replace('/');
              router.refresh();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
