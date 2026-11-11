'use client';

import { useEffect, useRef, useState } from 'react';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { isActive, useJob } from '@/features/jobs';
import {
  savedDefaults,
  type PluginSavedValues,
  type SavedValue,
} from '@/features/plugins/saved-values.utils';

import { initialValues, parseChoices, requestValues } from '../commands.utils';
import { loadCommands, loadJobLogs, startCommand } from '../server/commands-actions';

interface Detection {
  /** What the last search found; null before any search. */
  choices: SavedValue[] | null;
  searching: boolean;
  /** Why the search could not run, in the person's language. */
  error: string | null;
  detect: () => void;
}

/**
 * Runs the command a field takes its choices from (`choicesFrom`) and reads the choices from its
 * output. It is an ordinary run: authorized, audited and listed in Operations like any other;
 * its fields start with the values saved for the plugin (a relay address, a timeout).
 */
export function useDetectedChoices(
  source: string | undefined,
  saved: PluginSavedValues,
  onFound: (choices: SavedValue[]) => void,
): Detection {
  const errorMessage = useErrorMessage();
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [choices, setChoices] = useState<SavedValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(jobId);
  const finished = job !== undefined && !isActive(job);
  // The latest callback, without restarting the read when the form re-renders.
  const found = useRef(onFound);
  useEffect(() => {
    found.current = onFound;
  });

  useEffect(() => {
    if (jobId === null || !finished) return;
    let stopped = false;
    void loadJobLogs({ jobId, after: 0 }).then((result) => {
      if (stopped) return;
      const read = result.ok ? parseChoices(result.data.map((line) => line.line)) : [];
      setChoices(read);
      setJobId(null);
      found.current(read);
    });
    return () => {
      stopped = true;
    };
  }, [jobId, finished]);

  const detect = () => {
    if (!source || starting || jobId !== null) return;
    setStarting(true);
    setError(null);
    void (async () => {
      const catalog = await loadCommands();
      const entry = catalog.ok
        ? catalog.data.entries.find((candidate) => candidate.id === source)
        : undefined;
      if (!entry) {
        setError(errorMessage(catalog.ok ? 'commands.unavailable' : catalog.error.code));
        setStarting(false);
        return;
      }
      const params = requestValues(entry.params, initialValues(entry.params, savedDefaults(saved)));
      const started = await startCommand({ entry: entry.id, params, dryRun: false });
      setStarting(false);
      if (!started.ok) {
        setError(errorMessage(started.error.code, started.error.params));
        return;
      }
      setJobId(started.data.id);
    })();
  };

  return { choices, searching: starting || jobId !== null, error, detect };
}
