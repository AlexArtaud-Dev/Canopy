'use client';

import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent } from 'react';

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

import { allPermissions, type PermissionRow } from '../access.utils';

export interface RoleFormValues {
  name: string;
  description: string;
  permissions: string[];
}

interface RoleDialogProps {
  open: boolean;
  /** Null to create. */
  editing: { label: string; builtIn: boolean; values: RoleFormValues } | null;
  matrix: readonly PermissionRow[];
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (values: RoleFormValues) => void;
  onOpenChange: (open: boolean) => void;
}

export function RoleDialog({
  open,
  editing,
  matrix,
  pending,
  invalidFields,
  error,
  onSubmit,
  onOpenChange,
}: RoleDialogProps) {
  const t = useTranslations('access');
  const [fullAccess, setFullAccess] = useState(
    editing?.values.permissions.includes(allPermissions) ?? false,
  );
  const invalid = (field: string) => invalidFields.has(field) || undefined;
  // i18n-dynamic: access.modules access.actions — keys come from the module registry.
  const label = (key: string) => t(key as Parameters<typeof t>[0]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      name: editing?.builtIn ? editing.values.name : formText(form, 'name'),
      description: formText(form, 'description'),
      permissions: fullAccess
        ? [allPermissions]
        : form.getAll('permissions').filter((value) => typeof value === 'string'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('roles.form.editTitle', { name: editing.label })
                : t('roles.form.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('roles.description')}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field data-invalid={invalid('name')}>
              <FieldLabel htmlFor="role-name">{t('roles.form.name')}</FieldLabel>
              <Input
                id="role-name"
                name="name"
                defaultValue={editing?.label}
                disabled={editing?.builtIn}
                aria-invalid={invalid('name')}
              />
              {invalid('name') ? (
                <FieldError>{t('roles.form.errors.name')}</FieldError>
              ) : (
                editing?.builtIn && (
                  <FieldDescription>{t('roles.form.builtInName')}</FieldDescription>
                )
              )}
            </Field>
            <Field data-invalid={invalid('description')}>
              <FieldLabel htmlFor="role-description">{t('roles.form.description')}</FieldLabel>
              <Input
                id="role-description"
                name="description"
                defaultValue={editing?.values.description}
                aria-invalid={invalid('description')}
              />
              {invalid('description') && (
                <FieldError>{t('roles.form.errors.description')}</FieldError>
              )}
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="role-full-access"
                checked={fullAccess}
                onCheckedChange={(checked) => {
                  setFullAccess(checked === true);
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="role-full-access">{t('roles.form.fullAccess')}</FieldLabel>
                <FieldDescription>{t('roles.form.fullAccessHint')}</FieldDescription>
              </FieldContent>
            </Field>
            {!fullAccess && (
              <FieldSet>
                <FieldLegend variant="label">{t('roles.form.permissions')}</FieldLegend>
                <div className="divide-y rounded-lg border">
                  {matrix.map((row) => (
                    <div
                      key={row.module}
                      className="grid gap-2 p-3 sm:grid-cols-[8rem_1fr] sm:items-center"
                    >
                      <span className="text-sm font-medium">{label(`modules.${row.module}`)}</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {row.actions.map(({ action, permission }) => (
                          <Field key={permission} orientation="horizontal" className="w-auto">
                            <Checkbox
                              id={`perm-${permission}`}
                              name="permissions"
                              value={permission}
                              defaultChecked={editing?.values.permissions.includes(permission)}
                            />
                            <FieldLabel htmlFor={`perm-${permission}`} className="font-normal">
                              {label(`actions.${action}`)}
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </FieldSet>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {editing ? t('roles.form.save') : t('roles.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
