'use client';

import type { CommandParam } from '@canopy/contracts';
import { Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type SyntheticEvent } from 'react';

import { Button } from '@/shared/ui/button';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import { localized } from '@/features/commands/commands.utils';

import type { PluginSavedValues } from '../saved-values.utils';

interface PluginSavedValuesProps {
  /** The plugin's fields values can be saved for. */
  fields: readonly CommandParam[];
  saved: PluginSavedValues;
  /** Saves a value; resolves to an error message, or null when saved. */
  onAdd: (field: string, label: string, value: string) => Promise<string | null>;
  onRemove: (field: string, value: string) => Promise<void>;
}

/**
 * Values an administrator saves for a plugin's fields (the screens of the house, a server
 * address): forms offer them by name, and start with the first one.
 */
export function PluginSavedValuesEditor({
  fields,
  saved,
  onAdd,
  onRemove,
}: PluginSavedValuesProps) {
  const t = useTranslations('plugins.saved');
  const locale = useLocale();
  const id = useId();
  const [field, setField] = useState(fields[0]?.name ?? '');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldLabel = (name: string) => {
    const param = fields.find((candidate) => candidate.name === name);
    return param ? localized(param.label, locale) : name;
  };
  const groups = Object.entries(saved).filter(([, items]) => items.length > 0);
  const complete = field !== '' && label.trim() !== '' && value.trim() !== '';

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!complete || pending) return;
    setPending(true);
    setError(null);
    const failure = await onAdd(field, label, value);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setLabel('');
    setValue('');
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="text-foreground text-sm font-medium">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {groups.length > 0 && (
        <dl className="grid gap-3">
          {groups.map(([name, items]) => (
            <div key={name} className="grid gap-1.5">
              <dt className="text-muted-foreground text-xs font-medium">{fieldLabel(name)}</dt>
              <dd>
                <ul className="divide-y rounded-md border">
                  {items.map((item) => (
                    <li key={item.value} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                      <span className="text-foreground min-w-0 shrink-0 text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                        {item.value}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ms-auto shrink-0"
                        aria-label={t('remove', { label: item.label })}
                        onClick={() => void onRemove(name, item.value)}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end"
      >
        <Field>
          <FieldLabel htmlFor={`${id}-field`}>{t('field')}</FieldLabel>
          <Select value={field} onValueChange={setField}>
            <SelectTrigger id={`${id}-field`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fields.map((param) => (
                <SelectItem key={param.name} value={param.name}>
                  {localized(param.label, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-label`}>{t('label')}</FieldLabel>
          <Input
            id={`${id}-label`}
            value={label}
            maxLength={60}
            disabled={pending}
            placeholder={t('labelPlaceholder')}
            autoComplete="off"
            onChange={(event) => {
              setLabel(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field data-invalid={error !== null || undefined}>
          <FieldLabel htmlFor={`${id}-value`}>{t('value')}</FieldLabel>
          <Input
            id={`${id}-value`}
            value={value}
            maxLength={500}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={!complete || pending}>
          {pending ? <Spinner aria-hidden /> : <Plus aria-hidden />}
          {t('add')}
        </Button>
        {error && (
          <FieldError id={`${id}-error`} className="sm:col-span-4">
            {error}
          </FieldError>
        )}
      </form>
    </div>
  );
}
