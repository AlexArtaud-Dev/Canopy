'use client';

import type { CommandParam, CommandPlugin } from '@canopy/contracts';
import { FolderOpen, Radar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import type { PluginSavedValues, SavedValue } from '@/features/plugins/saved-values.utils';

import {
  choiceLabel,
  localized,
  mergeChoices,
  pickerStart,
  type FormValue,
} from '../commands.utils';
import { useDetectedChoices } from '../model/use-detected-choices';
import { DeviceField } from './device-field';
import { PathPickerDialog } from './path-picker-dialog';

interface ParamFieldProps {
  id: string;
  param: CommandParam;
  value: FormValue;
  /** Values saved for this field, offered by name above the input. */
  saved: readonly SavedValue[];
  /** Everything saved for the plugin: what the command listing choices starts with. */
  pluginSaved: PluginSavedValues;
  locale: string;
  autoFocus: boolean;
  /** The plugin the command comes from: where device fields find their devices. */
  plugin: CommandPlugin | undefined;
  onChange: (value: FormValue) => void;
}

/** One field of a command's form, by the type of its param. */
export function ParamField({
  id,
  param,
  value,
  saved,
  pluginSaved,
  locale,
  autoFocus,
  plugin,
  onChange,
}: ParamFieldProps) {
  const t = useTranslations('commands.page');
  const label = `${localized(param.label, locale)}${param.required ? ' *' : ''}`;
  const text = typeof value === 'string' ? value : '';
  const [picking, setPicking] = useState(false);
  // Existing files and folders are picked; a path to create is typed (its name is new).
  const browsable = param.type === 'path' && param.access !== 'create';
  const pick = param.on === 'file' ? 'file' : 'folder';
  const detection = useDetectedChoices(param.choicesFrom, pluginSaved, (found) => {
    // A field still empty takes the first thing found: one click casts to the only TV.
    const first = found[0];
    if (first && text === '') onChange(first.value);
  });

  if (param.device !== undefined && plugin !== undefined) {
    return (
      <DeviceField
        id={id}
        label={label}
        help={param.help ? localized(param.help, locale) : undefined}
        pluginId={plugin.id}
        kind={param.device}
        pairable={plugin.devices?.some((kind) => kind.kind === param.device && kind.pair) === true}
        value={text}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    );
  }

  if (param.type === 'bool') {
    return (
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={value === true}
          autoFocus={autoFocus}
          onCheckedChange={(checked) => {
            onChange(checked === true);
          }}
        />
        <div className="grid gap-1">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {param.help && <FieldDescription>{localized(param.help, locale)}</FieldDescription>}
        </div>
      </Field>
    );
  }

  const choices = mergeChoices(saved, detection.choices ?? []);
  return (
    <Field data-invalid={detection.error !== null || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {(choices.length > 0 || param.choicesFrom) && (
        <div className="flex gap-2">
          <Select
            value={choices.some((item) => item.value === text) ? text : ''}
            disabled={choices.length === 0}
            onValueChange={onChange}
          >
            <SelectTrigger
              className="min-w-0 flex-1"
              aria-label={t('choicesFor', { field: label })}
            >
              <SelectValue
                placeholder={choices.length === 0 ? t('choicesEmpty') : t('choicesPick')}
              />
            </SelectTrigger>
            <SelectContent>
              {choices.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {param.choicesFrom && (
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={detection.searching}
              aria-busy={detection.searching}
              onClick={detection.detect}
            >
              {detection.searching ? <Spinner aria-hidden /> : <Radar aria-hidden />}
              {detection.searching ? t('detecting') : t('detect')}
            </Button>
          )}
        </div>
      )}
      {param.type === 'enum' ? (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" autoFocus={autoFocus}>
            <SelectValue placeholder={t('choose')} />
          </SelectTrigger>
          <SelectContent>
            {(param.values ?? []).map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choiceLabel(param, choice, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : param.secret ? (
        <PasswordInput
          id={id}
          value={text}
          autoComplete="off"
          autoFocus={autoFocus}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <div className="flex gap-2">
          <Input
            id={id}
            value={text}
            type={param.type === 'int' ? 'number' : 'text'}
            min={param.min}
            max={param.max}
            autoFocus={autoFocus}
            placeholder={param.type === 'path' ? t('pathPlaceholder') : undefined}
            className={param.type === 'path' ? 'min-w-0 flex-1 font-mono' : undefined}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {browsable && (
            <>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  setPicking(true);
                }}
              >
                <FolderOpen aria-hidden />
                {t('browse')}
              </Button>
              <PathPickerDialog
                open={picking}
                onOpenChange={setPicking}
                field={localized(param.label, locale)}
                pick={pick}
                extensions={param.extensions}
                startPath={pickerStart(text, pick)}
                onPick={onChange}
              />
            </>
          )}
        </div>
      )}
      {param.help && <FieldDescription>{localized(param.help, locale)}</FieldDescription>}
      {detection.error !== null && <FieldError>{detection.error}</FieldError>}
      {detection.error === null && detection.choices?.length === 0 && (
        <FieldDescription role="status">{t('detectedNone')}</FieldDescription>
      )}
    </Field>
  );
}
