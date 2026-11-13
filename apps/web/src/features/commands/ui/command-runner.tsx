'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FlaskConical, Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState, useTransition } from 'react';

import type { CommandEntry, CommandParam } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';
import {
  isSavable,
  savedDefaults,
  type PluginSavedValues,
} from '@/features/plugins/saved-values.utils';
import { loadSavedValues } from '@/features/plugins/server/saved-values-actions';

import {
  advancedInUse,
  displayArgv,
  firstToFill,
  initialValues,
  requestValues,
  splitParams,
  type FormValue,
} from '../commands.utils';
import { useRecentCommands } from '../model/use-recent-commands';
import { previewCommand, startCommand } from '../server/commands-actions';
import { ParamField } from './param-field';
import { RunOutput } from './run-output';

/** Typing pauses this long before the argument preview is refreshed. */
const previewDelayMs = 300;
/** The engine's answer while required fields are empty. */
const missingParam = 'commands.missing_param';

interface CommandRunnerProps {
  entry: CommandEntry;
  /** Values filled in beforehand (the folder a menu was opened on). */
  preset?: Readonly<Record<string, FormValue>>;
  /** Put the cursor in the first required field still empty (dialogs). */
  focusFirst?: boolean;
}

const nothingSaved: PluginSavedValues = {};

/**
 * A command's form, the exact arguments it would run with, then its run and output. A plugin's
 * form waits for the values administrators saved for it: its fields start with them.
 */
export function CommandRunner(props: CommandRunnerProps) {
  const plugin = props.entry.plugin?.id;
  const { data, isPending } = useQuery({
    queryKey: ['plugins', 'saved-values'],
    queryFn: async () => {
      const result = await loadSavedValues();
      return result.ok ? result.data : {};
    },
    enabled: plugin !== undefined,
    staleTime: 60_000,
  });
  if (plugin !== undefined && isPending) return <Skeleton className="h-40 w-full" />;
  return <CommandForm {...props} saved={(plugin ? data?.[plugin] : undefined) ?? nothingSaved} />;
}

interface CommandFormProps extends CommandRunnerProps {
  saved: PluginSavedValues;
}

function CommandForm({ entry, preset, saved, focusFirst = false }: CommandFormProps) {
  const t = useTranslations('commands.page');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    initialValues(entry.params, { ...savedDefaults(saved), ...preset }),
  );
  const [focusName] = useState(() => (focusFirst ? firstToFill(entry.params, values) : undefined));
  const [dryRun, setDryRun] = useState(entry.dryRun);
  const [preview, setPreview] = useState<
    { text: string } | { error: string; incomplete: boolean } | null
  >(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { remember } = useRecentCommands();
  const { essential, advanced } = splitParams(entry.params);
  const [moreOpen, setMoreOpen] = useState(() => advancedInUse(entry.params, values));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const request = { entry: entry.id, params: requestValues(entry.params, values), dryRun };
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void previewCommand(JSON.parse(requestKey)).then((result) => {
        setPreview(
          result.ok
            ? { text: displayArgv(result.data.binary, result.data.argv) }
            : {
                error: errorMessage(result.error.code, result.error.params),
                // A form still being filled in is not an error: say what is left, calmly.
                incomplete: result.error.code === missingParam,
              },
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
        setPreview({
          error: errorMessage(result.error.code, result.error.params),
          incomplete: false,
        });
        return;
      }
      setJobId(result.data.id);
      remember(entry.id);
    });
  };

  const field = (param: CommandParam) => (
    <ParamField
      key={param.name}
      id={`${formId}-${param.name}`}
      param={param}
      value={values[param.name] ?? ''}
      saved={isSavable(param) ? (saved[param.name] ?? []) : []}
      pluginSaved={saved}
      locale={locale}
      autoFocus={param.name === focusName}
      onChange={(value) => {
        setValues((current) => ({ ...current, [param.name]: value }));
      }}
    />
  );

  return (
    <div className="grid content-start gap-4">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && !(preview && 'error' in preview)) run();
        }}
      >
        {essential.map(field)}
        {advanced.length > 0 && (
          <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="grid gap-4">
            <CollapsibleTrigger className="hover:bg-muted/60 group -mx-2 flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-sm font-medium">
              <ChevronRight
                aria-hidden
                className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-90"
              />
              {t('moreOptions', { count: advanced.length })}
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4">{advanced.map(field)}</CollapsibleContent>
          </Collapsible>
        )}
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
        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="grid gap-1.5">
          <CollapsibleTrigger className="hover:bg-muted/60 group text-muted-foreground -mx-2 flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-sm">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-data-[state=open]:rotate-90"
            />
            {t('preview')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {preview !== null && 'text' in preview ? preview.text : '…'}
            </pre>
          </CollapsibleContent>
        </Collapsible>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {preview !== null && 'error' in preview && (
            <p
              aria-live="polite"
              className={cn(
                'mr-auto text-sm',
                preview.incomplete ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              {preview.error}
            </p>
          )}
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
