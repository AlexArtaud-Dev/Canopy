'use client';

import { useMessages, useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { ErrorDto } from '@/shared/lib/errors';

import { resolveErrorKey } from './error-key';
import type { FormErrorContent } from './form-error';

/** Translates an error code from the server; unknown codes read as `system.unexpected`. */
export function useErrorMessage() {
  const errors = useTranslations('errors');
  // i18n-dynamic: errors — codes arrive at runtime; every `errors.*` key may be shown.
  const catalog = useMessages().errors;
  return useCallback(
    (code: string, params?: Readonly<Record<string, string | number>>) => {
      const key = resolveErrorKey(code, catalog);
      // `key` is validated against the loaded catalog; next-intl cannot type a runtime key.
      return errors(key as Parameters<typeof errors>[0], params);
    },
    [catalog, errors],
  );
}

/** Form banner content: the translated message, plus the request ID for system failures only. */
export function useFormError() {
  const errorMessage = useErrorMessage();
  return useCallback(
    (error: ErrorDto): FormErrorContent => ({
      message: errorMessage(error.code, error.params),
      reference: error.code.startsWith('system.') ? error.requestId : undefined,
    }),
    [errorMessage],
  );
}
