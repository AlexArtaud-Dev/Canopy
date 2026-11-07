'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { downloadText } from '@/shared/lib/download';

import {
  confirmTotpEnrollment,
  disableTotp,
  regenerateRecoveryCodes,
  startTotpEnrollment,
} from './server/two-factor';
import { PasswordConfirmDialog } from './ui/password-confirm-dialog';
import { TotpCard, type TotpView } from './ui/totp-card';

type StepUp = 'disable' | 'regenerate' | null;

export function TotpContainer({
  enabled,
  remainingCodes,
}: {
  enabled: boolean;
  remainingCodes: number;
}) {
  const t = useTranslations('auth.totp');
  const toFormError = useFormError();
  const [view, setView] = useState<TotpView>(
    enabled ? { kind: 'on', remainingCodes } : { kind: 'off' },
  );
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [stepUp, setStepUp] = useState<StepUp>(null);
  const [stepUpError, setStepUpError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();
  const codes = view.kind === 'codes' ? view.codes : [];

  const start = () => {
    startTransition(async () => {
      const result = await startTotpEnrollment();
      setError(result.ok ? null : toFormError(result.error));
      if (result.ok) setView({ kind: 'enrolling', ...result.data });
    });
  };

  const confirm = (code: string) => {
    startTransition(async () => {
      const result = await confirmTotpEnrollment({ code });
      setError(result.ok ? null : toFormError(result.error));
      if (!result.ok) return;
      setView({ kind: 'codes', codes: result.data.recoveryCodes });
      toast.success(t('enabledToast'));
    });
  };

  const confirmStepUp = (password: string) => {
    startTransition(async () => {
      if (stepUp === 'disable') {
        const result = await disableTotp({ password });
        setStepUpError(result.ok ? null : toFormError(result.error));
        if (!result.ok) return;
        setView({ kind: 'off' });
        toast.success(t('disabledToast'));
      } else {
        const result = await regenerateRecoveryCodes({ password });
        setStepUpError(result.ok ? null : toFormError(result.error));
        if (!result.ok) return;
        setView({ kind: 'codes', codes: result.data.recoveryCodes });
      }
      setStepUp(null);
    });
  };

  return (
    <>
      <TotpCard
        view={view}
        pending={pending}
        error={error}
        onStart={start}
        onConfirm={confirm}
        onCancel={() => {
          setError(null);
          setView({ kind: 'off' });
        }}
        onCopyCodes={() => {
          void navigator.clipboard.writeText(codes.join('\n')).then(() => {
            toast.success(t('copied'));
          });
        }}
        onDownloadCodes={() => {
          downloadText('canopy-recovery-codes.txt', `${codes.join('\n')}\n`, 'text/plain');
        }}
        onCodesSaved={() => {
          setView({ kind: 'on', remainingCodes: codes.length });
        }}
        onRegenerate={() => {
          setStepUp('regenerate');
        }}
        onDisable={() => {
          setStepUp('disable');
        }}
      />
      <PasswordConfirmDialog
        open={stepUp !== null}
        destructive={stepUp === 'disable'}
        description={stepUp === 'disable' ? t('disableDescription') : t('regenerateDescription')}
        pending={pending}
        error={stepUpError}
        onConfirm={confirmStepUp}
        onOpenChange={(open) => {
          if (!open) {
            setStepUp(null);
            setStepUpError(null);
          }
        }}
      />
    </>
  );
}
