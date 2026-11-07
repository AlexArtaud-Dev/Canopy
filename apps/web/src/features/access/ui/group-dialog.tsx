'use client';

import { useTranslations } from 'next-intl';
import type { SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

export interface GroupFormValues {
  name: string;
  description: string;
  requireTwoFactor: boolean;
  roleIds: string[];
}

interface Option {
  id: string;
  label: string;
}

interface GroupDialogProps {
  open: boolean;
  /** Null to create. */
  editing: GroupFormValues | null;
  roles: readonly Option[];
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (values: GroupFormValues) => void;
  onOpenChange: (open: boolean) => void;
}

export function GroupDialog({
  open,
  editing,
  roles,
  pending,
  invalidFields,
  error,
  onSubmit,
  onOpenChange,
}: GroupDialogProps) {
  const t = useTranslations('access.groups');
  const invalid = (field: string) => invalidFields.has(field) || undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      name: formText(form, 'name'),
      description: formText(form, 'description'),
      requireTwoFactor: form.get('requireTwoFactor') === 'on',
      roleIds: form.getAll('roleIds').filter((value) => typeof value === 'string'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('form.editTitle', { name: editing.name }) : t('form.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && <FormError error={error} />}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={invalid('name')}>
                <FieldLabel htmlFor="group-name">{t('form.name')}</FieldLabel>
                <Input
                  id="group-name"
                  name="name"
                  defaultValue={editing?.name}
                  autoFocus
                  aria-invalid={invalid('name')}
                />
                {invalid('name') && <FieldError>{t('form.errors.name')}</FieldError>}
              </Field>
              <Field data-invalid={invalid('description')}>
                <FieldLabel htmlFor="group-description">{t('form.description')}</FieldLabel>
                <Input
                  id="group-description"
                  name="description"
                  defaultValue={editing?.description}
                  aria-invalid={invalid('description')}
                />
                {invalid('description') && <FieldError>{t('form.errors.description')}</FieldError>}
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="group-2fa"
                name="requireTwoFactor"
                defaultChecked={editing?.requireTwoFactor}
              />
              <FieldContent>
                <FieldLabel htmlFor="group-2fa">{t('form.requireTwoFactor')}</FieldLabel>
                <FieldDescription>{t('form.requireTwoFactorHint')}</FieldDescription>
              </FieldContent>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">{t('form.roles')}</FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => (
                  <Field key={role.id} orientation="horizontal">
                    <Checkbox
                      id={`group-role-${role.id}`}
                      name="roleIds"
                      value={role.id}
                      defaultChecked={editing?.roleIds.includes(role.id)}
                    />
                    <FieldLabel htmlFor={`group-role-${role.id}`} className="font-normal">
                      {role.label}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {editing ? t('form.save') : t('form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
