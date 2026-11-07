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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { PasswordInput } from '@/shared/ui/password-input';

export interface RoleChoice {
  id: string;
  label: string;
}

export interface UserFormValues {
  username: string;
  displayName: string;
  contactEmail: string;
  password: string;
  confirmPassword: string;
  roleIds: string[];
}

interface UserFormDialogProps {
  /** Null to create; the edited user otherwise (username and password are then hidden). */
  editing: { name: string; displayName: string; contactEmail: string; roleIds: string[] } | null;
  open: boolean;
  roles: readonly RoleChoice[];
  passwordMinLength: number;
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (values: UserFormValues) => void;
  onOpenChange: (open: boolean) => void;
}

export function UserFormDialog({
  editing,
  open,
  roles,
  passwordMinLength,
  pending,
  invalidFields,
  error,
  onSubmit,
  onOpenChange,
}: UserFormDialogProps) {
  const t = useTranslations('users.form');
  const invalid = (field: string) => invalidFields.has(field) || undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      username: formText(form, 'username'),
      displayName: formText(form, 'displayName'),
      contactEmail: formText(form, 'contactEmail'),
      password: formText(form, 'password'),
      confirmPassword: formText(form, 'confirmPassword'),
      roleIds: form.getAll('roleIds').filter((value) => typeof value === 'string'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editTitle', { name: editing.name }) : t('createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editing ? t('editDescription') : t('createDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && <FormError error={error} />}
            {!editing && (
              <Field data-invalid={invalid('username')}>
                <FieldLabel htmlFor="user-username">{t('username')}</FieldLabel>
                <Input
                  id="user-username"
                  name="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  aria-invalid={invalid('username')}
                />
                {invalid('username') && <FieldError>{t('errors.username')}</FieldError>}
              </Field>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={invalid('displayName')}>
                <FieldLabel htmlFor="user-displayName">{t('displayName')}</FieldLabel>
                <Input
                  id="user-displayName"
                  name="displayName"
                  defaultValue={editing?.displayName}
                  aria-invalid={invalid('displayName')}
                />
                {invalid('displayName') && <FieldError>{t('errors.displayName')}</FieldError>}
              </Field>
              <Field data-invalid={invalid('contactEmail')}>
                <FieldLabel htmlFor="user-contactEmail">{t('contactEmail')}</FieldLabel>
                <Input
                  id="user-contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={editing?.contactEmail}
                  aria-invalid={invalid('contactEmail')}
                />
                {invalid('contactEmail') && <FieldError>{t('errors.contactEmail')}</FieldError>}
              </Field>
            </div>
            {!editing && (
              <div className="grid gap-6 sm:grid-cols-2">
                <Field data-invalid={invalid('password')}>
                  <FieldLabel htmlFor="user-password">{t('password')}</FieldLabel>
                  <PasswordInput
                    id="user-password"
                    name="password"
                    autoComplete="new-password"
                    aria-invalid={invalid('password')}
                  />
                  {invalid('password') && (
                    <FieldError>{t('errors.password', { min: passwordMinLength })}</FieldError>
                  )}
                </Field>
                <Field data-invalid={invalid('confirmPassword')}>
                  <FieldLabel htmlFor="user-confirmPassword">{t('confirmPassword')}</FieldLabel>
                  <PasswordInput
                    id="user-confirmPassword"
                    name="confirmPassword"
                    autoComplete="new-password"
                    aria-invalid={invalid('confirmPassword')}
                  />
                  {invalid('confirmPassword') && (
                    <FieldError>{t('errors.confirmPassword')}</FieldError>
                  )}
                </Field>
              </div>
            )}
            <FieldSet>
              <FieldLegend variant="label">{t('roles')}</FieldLegend>
              <FieldDescription>{t('rolesHint')}</FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => (
                  <Field key={role.id} orientation="horizontal">
                    <Checkbox
                      id={`role-${role.id}`}
                      name="roleIds"
                      value={role.id}
                      defaultChecked={editing?.roleIds.includes(role.id)}
                    />
                    <FieldLabel htmlFor={`role-${role.id}`} className="font-normal">
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
              {editing ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
