'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import type { Device } from '../devices.utils';

interface DeviceNameDialogProps {
  open: boolean;
  mode: 'add' | 'rename';
  /** The device renamed; null when one is added. */
  device: Device | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { locator: string; name: string }) => void;
}

/** Names a kept device, or adds one by its address with an optional name. */
export function DeviceNameDialog(props: DeviceNameDialogProps) {
  const t = useTranslations('devices.page');
  const formId = useId();
  const { open, device } = props;
  // The parent mounts a fresh dialog for each device, so these start from it.
  const [locator, setLocator] = useState('');
  const [name, setName] = useState(device?.customName ?? '');

  const adding = props.mode === 'add';
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{adding ? t('addTitle') : t('renameTitle')}</DialogTitle>
          <DialogDescription>
            {adding
              ? t('addDescription')
              : t('renameDescription', { name: device?.detectedName ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit({ locator: locator.trim(), name: name.trim() });
          }}
        >
          {adding && (
            <Field>
              <FieldLabel htmlFor={`${formId}-locator`}>{t('locator')}</FieldLabel>
              <Input
                id={`${formId}-locator`}
                value={locator}
                required
                autoFocus
                placeholder="chromecast://192.168.1.42"
                className="font-mono"
                onChange={(event) => {
                  setLocator(event.target.value);
                }}
              />
              <FieldDescription>{t('locatorHelp')}</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>{t('name')}</FieldLabel>
            <Input
              id={`${formId}-name`}
              value={name}
              maxLength={120}
              autoFocus={!adding}
              placeholder={device?.detectedName}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {!adding && <FieldDescription>{t('nameHelp')}</FieldDescription>}
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={props.pending || (adding && locator.trim() === '')}
            aria-busy={props.pending}
          >
            {props.pending && <Spinner data-icon="inline-start" />}
            {adding ? t('add') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
