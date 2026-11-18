'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

interface DashboardNameDialogProps {
  mode: 'create' | 'rename';
  initial: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** Names a new dashboard, or renames one. */
export function DashboardNameDialog({
  mode,
  initial,
  pending,
  onClose,
  onSubmit,
}: DashboardNameDialogProps) {
  const t = useTranslations('dashboards.page');
  const formId = useId();
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('newTitle') : t('renameTitle')}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(name.trim());
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>{t('name')}</FieldLabel>
            <Input
              id={`${formId}-name`}
              value={name}
              required
              autoFocus
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={pending || name.trim() === ''}
            aria-busy={pending}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {mode === 'create' ? t('create') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
