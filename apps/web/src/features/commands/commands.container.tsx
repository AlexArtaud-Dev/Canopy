'use client';

import { FlaskConical, Play, TerminalSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import type { CommandCatalog, CommandEntry, CommandParam, JobLogLine } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PasswordInput } from '@/shared/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import { isActive, useJob } from '@/features/jobs';

import {
  displayArgv,
  initialValues,
  localized,
  requestValues,
  type FormValue,
} from './commands.utils';
import { loadJobLogs, previewCommand, startCommand } from './server/commands-actions';

/** Typing pauses this long before the argument preview is refreshed. */
const previewDelayMs = 300;
const logPollMs = 1000;

/** Catalog commands: pick one, fill its form, read the exact arguments, run, watch the output. */
export function CommandsContainer({ catalog }: { catalog: CommandCatalog }) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(catalog.entries[0]?.id ?? null);
  const selected = catalog.entries.find((entry) => entry.id === selectedId);

  if (catalog.entries.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TerminalSquare aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {catalog.advanced ? t('emptyDescription') : t('emptyBasic')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <nav aria-label={t('catalog')} className="grid content-start gap-2">
        {catalog.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === selectedId}
            onClick={() => {
              setSelectedId(entry.id);
            }}
            className={cn(
              'hover:bg-muted/60 grid gap-1 rounded-lg border p-3 text-left text-sm',
              entry.id === selectedId && 'border-primary bg-accent',
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="min-w-0 flex-1 truncate">{localized(entry.name, locale)}</span>
              {entry.mode === 'advanced' && <Badge variant="outline">{t('advanced')}</Badge>}
            </span>
            <span className="text-muted-foreground line-clamp-2 text-xs">
              {localized(entry.description, locale)}
            </span>
          </button>
        ))}
      </nav>
      {selected && <CommandForm key={selected.id} entry={selected} />}
    </div>
  );
}

function CommandForm({ entry }: { entry: CommandEntry }) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    initialValues(entry.params),
  );
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
      <Card>
        <CardHeader>
          <CardTitle>{localized(entry.name, locale)}</CardTitle>
          <CardDescription>{localized(entry.description, locale)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {entry.params.map((param) => (
            <ParamField
              key={param.name}
              param={param}
              value={values[param.name] ?? ''}
              locale={locale}
              onChange={(value) => {
                setValues((current) => ({ ...current, [param.name]: value }));
              }}
            />
          ))}
          {entry.dryRun && (
            <Field orientation="horizontal">
              <Checkbox
                id="command-dry-run"
                checked={dryRun}
                onCheckedChange={(checked) => {
                  setDryRun(checked === true);
                }}
              />
              <FieldLabel htmlFor="command-dry-run">{t('dryRun')}</FieldLabel>
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
              disabled={pending || (preview !== null && 'error' in preview)}
              aria-busy={pending}
              onClick={run}
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
        </CardContent>
      </Card>
      {jobId && <RunOutput key={jobId} jobId={jobId} />}
    </div>
  );
}

interface ParamFieldProps {
  param: CommandParam;
  value: FormValue;
  locale: string;
  onChange: (value: FormValue) => void;
}

function ParamField({ param, value, locale, onChange }: ParamFieldProps) {
  const t = useTranslations('commands.page');
  const id = `command-param-${param.name}`;
  const label = `${localized(param.label, locale)}${param.required ? ' *' : ''}`;
  if (param.type === 'bool') {
    return (
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={value === true}
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
          <SelectTrigger id={id} className="w-full">
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

/** The run's output, read every second while it runs (the operations panel shows progress). */
function RunOutput({ jobId }: { jobId: string }) {
  const t = useTranslations('commands.page');
  const job = useJob(jobId);
  const [lines, setLines] = useState<JobLogLine[]>([]);
  const lastSeq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const running = !job || isActive(job);

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      const result = await loadJobLogs({ jobId, after: lastSeq.current });
      if (stopped || !result.ok || result.data.length === 0) return;
      lastSeq.current = result.data.at(-1)?.seq ?? lastSeq.current;
      setLines((current) => [...current, ...result.data]);
    };
    void read();
    if (!running) return;
    const timer = window.setInterval(() => void read(), logPollMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [jobId, running]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {running && <Spinner />}
          {/* i18n-dynamic: commands.page.state */}
          {t(`state.${job?.state ?? 'queued'}`)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs">
          {lines.length === 0 ? (
            <p className="text-muted-foreground font-sans">{t('noOutput')}</p>
          ) : (
            lines.map((line) => (
              <p
                key={line.seq}
                className={cn(
                  'whitespace-pre-wrap break-all',
                  line.level !== 'info' && 'text-destructive',
                )}
              >
                {line.line}
              </p>
            ))
          )}
          <div ref={bottom} />
        </div>
      </CardContent>
    </Card>
  );
}
