'use client';

import { Lock, MapPin, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import { parseFieldInput, type FieldView } from '../settings-form.utils';

interface SettingFieldProps {
  field: FieldView;
  label: string;
  description: string;
  /** Editing allowed for this viewer (permission, env lock and local-only already applied). */
  editable: boolean;
  /** Local-only field opened from elsewhere: explains why it is read-only. */
  needsLocal: boolean;
  pending: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
}

/** Form state from a stored value (sensitive or missing values start empty). */
function initialDraft(value: unknown): string | boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function display(value: unknown): string {
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '—';
}

export function SettingField({
  field,
  label,
  description,
  editable,
  needsLocal,
  pending,
  onSave,
  onReset,
}: SettingFieldProps) {
  const t = useTranslations('settings');
  const [draft, setDraft] = useState<string | boolean>(initialDraft(field.value));
  const id = `setting-${field.key}`;
  const dirty = parseFieldInput(field.control, draft) !== field.value;
  const { control } = field;

  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_16rem] sm:gap-6">
      <div className="grid content-start gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="text-muted-foreground text-sm">{description}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {field.modified && <Badge variant="secondary">{t('modified')}</Badge>}
          {field.locked && field.env && (
            <Badge variant="outline" className="gap-1">
              <Lock aria-hidden />
              {t('locked', { env: field.env })}
            </Badge>
          )}
          {field.localOnly && (
            <Badge variant="outline" className="gap-1">
              <MapPin aria-hidden />
              {t('localOnly')}
            </Badge>
          )}
          {field.requiresRestart && (
            <Badge variant="outline" className="gap-1">
              <RotateCw aria-hidden />
              {t('restart')}
            </Badge>
          )}
        </div>
        {needsLocal && <p className="text-muted-foreground text-xs">{t('localOnlyHint')}</p>}
      </div>
      <div className="grid content-start gap-2">
        {control.kind === 'boolean' && (
          <Checkbox
            id={id}
            checked={draft === true}
            disabled={!editable || pending}
            onCheckedChange={(checked) => {
              setDraft(checked === true);
            }}
          />
        )}
        {control.kind === 'select' && (
          <Select
            value={String(draft)}
            disabled={!editable || pending}
            onValueChange={(value) => {
              setDraft(value);
            }}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {control.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(control.kind === 'number' || control.kind === 'text') && (
          <Input
            id={id}
            value={String(draft)}
            disabled={!editable || pending}
            inputMode={control.kind === 'number' ? 'numeric' : undefined}
            type={control.kind === 'text' && control.email ? 'email' : 'text'}
            maxLength={control.kind === 'text' ? (control.maxLength ?? undefined) : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        )}
        <p className="text-muted-foreground text-xs">
          {t('default', { value: display(field.defaultValue) })}
        </p>
        {editable && (
          <div className="flex gap-2">
            {dirty && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  onSave(parseFieldInput(control, draft));
                }}
              >
                {pending && <Spinner />}
                {t('save')}
              </Button>
            )}
            {field.modified && !dirty && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onReset}>
                <RotateCcw aria-hidden data-icon="inline-start" />
                {t('reset')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
