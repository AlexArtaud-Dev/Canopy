'use client';

import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent } from 'react';

import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Spinner } from '@/shared/ui/spinner';
import { Textarea } from '@/shared/ui/textarea';

interface InputDialogProps {
  title: string;
  pending: boolean;
  onSubmit: (input: string) => void;
  onClose: () => void;
}

/** The text an action needs (links to add, a new name): several lines welcome. */
export function InputDialog({ title, pending, onSubmit, onClose }: InputDialogProps) {
  const t = useTranslations('pluginViews');
  const [value, setValue] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="view-action-input">{t('input')}</FieldLabel>
            <Textarea
              id="view-action-input"
              value={value}
              rows={5}
              autoFocus
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending || !value.trim()}>
              {pending && <Spinner data-icon="inline-start" />}
              {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
