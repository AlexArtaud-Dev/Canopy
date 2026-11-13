'use client';

import type { CommandParam } from '@canopy/contracts';
import { Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type SyntheticEvent } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { FieldError } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { localized } from '@/features/commands/commands.utils';

import type { PluginSavedValues, SavedValue } from '../saved-values.utils';

interface FieldDefaultsProps {
  /** The plugin's fields values can be saved for. */
  fields: readonly CommandParam[];
  saved: PluginSavedValues;
  /** Saves a value; resolves to an error message, or null when saved. */
  onAdd: (field: string, label: string, value: string) => Promise<string | null>;
  onRemove: (field: string, value: string) => Promise<void>;
}

/**
 * What the plugin's forms start with, field by field: each field says what it is for, the first
 * value is the one forms use, and others are offered by name.
 */
export function FieldDefaults({ fields, saved, onAdd, onRemove }: FieldDefaultsProps) {
  const t = useTranslations('plugins.defaults');
  if (fields.length === 0) return <p className="text-muted-foreground text-sm">{t('none')}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {fields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          values={saved[field.name] ?? []}
          onAdd={(label, value) => onAdd(field.name, label, value)}
          onRemove={(value) => onRemove(field.name, value)}
        />
      ))}
    </ul>
  );
}

interface FieldRowProps {
  field: CommandParam;
  values: readonly SavedValue[];
  onAdd: (label: string, value: string) => Promise<string | null>;
  onRemove: (value: string) => Promise<void>;
}

function FieldRow({ field, values, onAdd, onRemove }: FieldRowProps) {
  const t = useTranslations('plugins.defaults');
  const locale = useLocale();
  const id = useId();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = localized(field.label, locale);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim() === '' || pending) return;
    setPending(true);
    setError(null);
    // A name is only needed to tell several values apart: the value names itself otherwise.
    const failure = await onAdd(label.trim() || value.trim(), value);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setValue('');
    setLabel('');
  };

  return (
    <li className="grid gap-3 p-4">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{name}</p>
        {field.help && (
          <p className="text-muted-foreground text-sm">{localized(field.help, locale)}</p>
        )}
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('values', { field: name })}>
          {values.map((item, index) => (
            <li
              key={item.value}
              className="bg-muted/50 flex min-h-9 items-center gap-2 rounded-md border ps-3 pe-1 text-sm"
            >
              {item.label !== item.value && <span className="font-medium">{item.label}</span>}
              <span className="text-muted-foreground font-mono text-xs">{item.value}</span>
              {index === 0 && <Badge variant="secondary">{t('used')}</Badge>}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('remove', { label: item.label })}
                onClick={() => void onRemove(item.value)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]"
        onSubmit={(event) => void submit(event)}
      >
        <Input
          value={value}
          maxLength={500}
          disabled={pending}
          inputMode={field.type === 'int' ? 'numeric' : undefined}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-label={t('value', { field: name })}
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder={values.length === 0 ? t('valuePlaceholder') : t('anotherPlaceholder')}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        <Input
          value={label}
          maxLength={60}
          disabled={pending}
          autoComplete="off"
          aria-label={t('label', { field: name })}
          placeholder={t('labelPlaceholder')}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        <Button type="submit" variant="outline" disabled={value.trim() === '' || pending}>
          {pending ? <Spinner aria-hidden /> : <Plus aria-hidden />}
          {t('add')}
        </Button>
        {error && (
          <FieldError id={`${id}-error`} className="sm:col-span-3">
            {error}
          </FieldError>
        )}
      </form>
    </li>
  );
}
