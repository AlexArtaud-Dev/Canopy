'use client';

import { FlaskConical, Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState, useTransition } from 'react';

import type { CommandEntry, CommandParam } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import {
  displayArgv,
  firstToFill,
  initialValues,
  localized,
  requestValues,
  type FormValue,
} from '../commands.utils';
import { previewCommand, startCommand } from '../server/commands-actions';
import { RunOutput } from './run-output';

/** Typing pauses this long before the argument preview is refreshed. */
const previewDelayMs = 300;

interface CommandRunnerProps {
  entry: CommandEntry;
  /** Values filled in beforehand (the folder a menu was opened on). */
  preset?: Readonly<Record<string, FormValue>>;
  /** Put the cursor in the first required field still empty (dialogs). */
  focusFirst?: boolean;
}

/** A command's form, the exact arguments it would run with, then its run and output. */
export function CommandRunner({ entry, preset, focusFirst = false }: CommandRunnerProps) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    initialValues(entry.params, preset),
  );
  const [focusName] = useState(() => (focusFirst ? firstToFill(entry.params, values) : undefined));
  const [dryRun, setDryRun] = useState(entry.dryRun);
  const [preview, setPreview] = useState<{ text: string } | { error: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const request = { entry: entry.id, params: requestValues(entry.params, values), dryRun };
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void previewCommand(JSON.parse(requestKey)).then((result) => {
        setPreview(
          result.ok
            ? { text: displayArgv(result.data.binary, result.data.argv) }
            : { error: errorMessage(result.error.code, result.error.params) },
        );
      });
    }, previewDelayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [requestKey, errorMessage]);

  const run = () => {
    startTransition(async () => {
      const result = await startCommand(request);
      if (!result.ok) {
        setPreview({ error: errorMessage(result.error.code, result.error.params) });
        return;
      }
      setJobId(result.data.id);
    });
  };

  return (
    <div className="grid content-start gap-4">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && !(preview && 'error' in preview)) run();
        }}
      >
        {entry.params.map((param) => (
          <ParamField
            key={param.name}
            id={`${formId}-${param.name}`}
            param={param}
            value={values[param.name] ?? ''}
            locale={locale}
            autoFocus={param.name === focusName}
            onChange={(value) => {
              setValues((current) => ({ ...current, [param.name]: value }));
            }}
          />
        ))}
        {entry.dryRun && (
          <Field orientation="horizontal">
            <Checkbox
              id={`${formId}-dry-run`}
              checked={dryRun}
              onCheckedChange={(checked) => {
                setDryRun(checked === true);
              }}
            />
            <FieldLabel htmlFor={`${formId}-dry-run`}>{t('dryRun')}</FieldLabel>
          </Field>
        )}
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">{t('preview')}</p>
          <pre
            aria-live="polite"
            className={cn(
              'bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all',
              preview && 'error' in preview && 'text-destructive font-sans',
            )}
          >
            {preview === null ? '…' : 'text' in preview ? preview.text : preview.error}
          </pre>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending || (preview !== null && 'error' in preview)}
            aria-busy={pending}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : dryRun ? (
              <FlaskConical aria-hidden data-icon="inline-start" />
            ) : (
              <Play aria-hidden data-icon="inline-start" />
            )}
            {dryRun ? t('runDry') : t('run')}
          </Button>
        </div>
      </form>
      {jobId && <RunOutput key={jobId} jobId={jobId} />}
    </div>
  );
}

interface ParamFieldProps {
  id: string;
  param: CommandParam;
  value: FormValue;
  locale: string;
  autoFocus: boolean;
  onChange: (value: FormValue) => void;
}

function ParamField({ id, param, value, locale, autoFocus, onChange }: ParamFieldProps) {
  const t = useTranslations('commands.page');
  const label = `${localized(param.label, locale)}${param.required ? ' *' : ''}`;
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
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      </Field>
    );
  }
  const text = typeof value === 'string' ? value : '';
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {param.type === 'enum' ? (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" autoFocus={autoFocus}>
            <SelectValue placeholder={t('choose')} />
          </SelectTrigger>
          <SelectContent>
            {(param.values ?? []).map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choice}
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
        <Input
          id={id}
          value={text}
          type={param.type === 'int' ? 'number' : 'text'}
          min={param.min}
          max={param.max}
          autoFocus={autoFocus}
          placeholder={param.type === 'path' ? t('pathPlaceholder') : undefined}
          className={param.type === 'path' ? 'font-mono' : undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
