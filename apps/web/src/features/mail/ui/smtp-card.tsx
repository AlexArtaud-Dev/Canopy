'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { formText } from '@/shared/lib/form';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import { smtpSecurityModes } from '../mail.settings';
import type { SmtpForm } from '../mail.utils';

export type SmtpValues = Omit<SmtpForm, 'password'>;

interface SmtpCardProps {
  values: SmtpValues;
  passwordSet: boolean;
  locked: ReadonlySet<string>;
  configured: boolean;
  canEdit: boolean;
  pending: boolean;
  invalidFields: ReadonlySet<string>;
  error: FormErrorContent | null;
  onSubmit: (form: SmtpForm) => void;
}

export function SmtpCard({
  values,
  passwordSet,
  locked,
  configured,
  canEdit,
  pending,
  invalidFields,
  error,
  onSubmit,
}: SmtpCardProps) {
  const t = useTranslations('mail');
  const [enabled, setEnabled] = useState(values.enabled);
  const [security, setSecurity] = useState(values.security);
  const disabled = (field: string) => !canEdit || locked.has(field);
  const invalid = (field: string) => invalidFields.has(field) || undefined;
  const lockHint = (field: string) =>
    locked.has(field) && (
      <FieldDescription className="flex items-center gap-1">
        <Lock className="size-3" aria-hidden />
        {t('smtp.locked')}
      </FieldDescription>
    );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      enabled,
      security,
      host: formText(form, 'host'),
      port: Number(formText(form, 'port')),
      username: formText(form, 'username'),
      password: formText(form, 'password'),
      fromAddress: formText(form, 'fromAddress'),
      fromName: formText(form, 'fromName'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('smtp.title')}</CardTitle>
        <CardDescription>{t('smtp.description')}</CardDescription>
        <CardAction>
          <Badge variant={configured ? 'default' : 'outline'}>
            {configured ? t('status.configured') : t('status.off')}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
          <FieldGroup>
            {error && <FormError error={error} />}
            <Field orientation="horizontal">
              <Checkbox
                id="smtp-enabled"
                checked={enabled}
                disabled={disabled('enabled')}
                onCheckedChange={(checked) => {
                  setEnabled(checked === true);
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="smtp-enabled">{t('smtp.enabled')}</FieldLabel>
                <FieldDescription>{t('smtp.enabledHint')}</FieldDescription>
                {lockHint('enabled')}
              </FieldContent>
            </Field>
            <div className="grid gap-6 sm:grid-cols-[1fr_8rem]">
              <Field>
                <FieldLabel htmlFor="smtp-host">{t('smtp.host')}</FieldLabel>
                <Input
                  id="smtp-host"
                  name="host"
                  defaultValue={values.host}
                  disabled={disabled('host')}
                  placeholder="smtp.example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
                {lockHint('host')}
              </Field>
              <Field data-invalid={invalid('port')}>
                <FieldLabel htmlFor="smtp-port">{t('smtp.port')}</FieldLabel>
                <Input
                  id="smtp-port"
                  name="port"
                  inputMode="numeric"
                  defaultValue={values.port}
                  disabled={disabled('port')}
                  aria-invalid={invalid('port')}
                />
                {invalid('port') && <FieldError>{t('smtp.errors.port')}</FieldError>}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="smtp-security">{t('smtp.security')}</FieldLabel>
              <Select
                value={security}
                disabled={disabled('security')}
                onValueChange={(value) => {
                  const next = smtpSecurityModes.find((mode) => mode === value);
                  if (next) setSecurity(next);
                }}
              >
                <SelectTrigger id="smtp-security" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {smtpSecurityModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`smtp.securityModes.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="smtp-username">{t('smtp.username')}</FieldLabel>
                <Input
                  id="smtp-username"
                  name="username"
                  defaultValue={values.username}
                  disabled={disabled('username')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-password">{t('smtp.password')}</FieldLabel>
                <PasswordInput
                  id="smtp-password"
                  name="password"
                  disabled={disabled('password')}
                  autoComplete="new-password"
                  placeholder={passwordSet ? '••••••••' : undefined}
                />
                {passwordSet && <FieldDescription>{t('smtp.passwordSet')}</FieldDescription>}
              </Field>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={invalid('fromAddress')}>
                <FieldLabel htmlFor="smtp-from">{t('smtp.fromAddress')}</FieldLabel>
                <Input
                  id="smtp-from"
                  name="fromAddress"
                  type="email"
                  defaultValue={values.fromAddress}
                  disabled={disabled('fromAddress')}
                  placeholder="canopy@example.com"
                  aria-invalid={invalid('fromAddress')}
                />
                {invalid('fromAddress') && <FieldError>{t('smtp.errors.fromAddress')}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-from-name">{t('smtp.fromName')}</FieldLabel>
                <Input
                  id="smtp-from-name"
                  name="fromName"
                  defaultValue={values.fromName}
                  disabled={disabled('fromName')}
                />
              </Field>
            </div>
            {canEdit && (
              <Button type="submit" className="w-fit" disabled={pending}>
                {pending && <Spinner />}
                {t('smtp.save')}
              </Button>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
