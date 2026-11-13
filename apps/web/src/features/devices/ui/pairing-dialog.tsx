'use client';

import { CircleCheck, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { isActive, useJob } from '@/features/jobs';
import { cancelJob } from '@/features/jobs/server/jobs-actions';

import { deviceName, type Device } from '../devices.utils';
import { confirmPairing, sendPairingCode, startPairing } from '../server/pairing-actions';

type Step =
  | { kind: 'starting' }
  | { kind: 'code'; jobId: string }
  | { kind: 'checking'; jobId: string }
  | { kind: 'paired' }
  | { kind: 'failed'; message: string };

const codePattern = /^[0-9]{4,8}$/;

interface PairingDialogProps {
  device: Device;
  onClose: () => void;
  onPaired: (device: Device) => void;
}

/**
 * Pairs a device in one place: the pairing starts as the dialog opens, the device shows a code,
 * the person types it here, and the device is marked paired once the plugin confirms. Closing
 * the dialog stops a pairing still waiting.
 */
export function PairingDialog({ device, onClose, onPaired }: PairingDialogProps) {
  const t = useTranslations('devices.pairing');
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [current, setStep] = useState<Step>({ kind: 'starting' });
  const [code, setCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const jobId = current.kind === 'code' || current.kind === 'checking' ? current.jobId : null;
  const job = useJob(jobId);
  // The pairing run ends after the code is handed over, or on its own (device off, time out).
  const ended = job !== undefined && !isActive(job);
  const step: Step =
    ended && job.state !== 'succeeded' ? { kind: 'failed', message: t('failed') } : current;
  const paired = useRef(onPaired);
  useEffect(() => {
    paired.current = onPaired;
  });

  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  // Each attempt starts one pairing, never two: a device pairs with one sender at a time, so a
  // second start (an effect run twice) would make the first fail.
  const startedAttempt = useRef(-1);
  useEffect(() => {
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    void startPairing({ id: device.id }).then((result) => {
      if (!open.current) {
        if (result.ok) void cancelJob({ jobId: result.data.jobId });
        return;
      }
      setStep(
        result.ok
          ? { kind: 'code', jobId: result.data.jobId }
          : { kind: 'failed', message: errorMessage(result.error.code, result.error.params) },
      );
    });
  }, [device.id, attempt, errorMessage]);

  const succeeded = ended && job.state === 'succeeded';
  useEffect(() => {
    if (!succeeded || jobId === null) return;
    void confirmPairing({ id: device.id, jobId }).then((result) => {
      if (!result.ok) {
        setStep({ kind: 'failed', message: errorMessage(result.error.code, result.error.params) });
        return;
      }
      setStep({ kind: 'paired' });
      paired.current(result.data);
    });
  }, [succeeded, jobId, device.id, errorMessage]);

  const close = () => {
    if (jobId !== null && step.kind !== 'paired' && !ended) void cancelJob({ jobId });
    onClose();
  };

  const submit = () => {
    if (step.kind !== 'code' || !codePattern.test(code)) return;
    const { jobId: pairing } = step;
    setStep({ kind: 'checking', jobId: pairing });
    void sendPairingCode({ id: device.id, code }).then((result) => {
      if (!result.ok) {
        setStep({ kind: 'failed', message: errorMessage(result.error.code, result.error.params) });
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: deviceName(device) })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {step.kind === 'starting' && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner aria-hidden />
            {t('starting')}
          </p>
        )}
        {(step.kind === 'code' || step.kind === 'checking') && (
          <form
            id={formId}
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field>
              <FieldLabel htmlFor={`${formId}-code`} className="flex items-center gap-1.5">
                <KeyRound aria-hidden className="size-4" />
                {t('codeLabel')}
              </FieldLabel>
              <Input
                id={`${formId}-code`}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                autoFocus
                disabled={step.kind === 'checking'}
                className="font-mono text-lg tracking-widest"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                }}
              />
            </Field>
            {step.kind === 'checking' && (
              <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                <Spinner aria-hidden />
                {t('checking')}
              </p>
            )}
          </form>
        )}
        {step.kind === 'paired' && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="text-primary size-4" />
            {t('paired', { name: deviceName(device) })}
          </p>
        )}
        {step.kind === 'failed' && <FieldError>{step.message}</FieldError>}
        <DialogFooter>
          {step.kind === 'paired' ? (
            <Button onClick={onClose}>{t('done')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {t('cancel')}
              </Button>
              {step.kind === 'failed' ? (
                <Button
                  onClick={() => {
                    setCode('');
                    setStep({ kind: 'starting' });
                    setAttempt((count) => count + 1);
                  }}
                >
                  {t('retry')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  form={formId}
                  disabled={step.kind !== 'code' || !codePattern.test(code)}
                >
                  {t('confirm')}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
