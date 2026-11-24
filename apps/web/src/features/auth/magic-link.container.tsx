'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type SubmitEvent } from 'react';

import { FormError, type FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { formText } from '@/shared/lib/form';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { requestMagicLink, signInWithMagicLink } from './server/magic-link';

/** Asks for a sign-in link: the same confirmation whether or not an account matched. */
export function MagicLinkRequestContainer() {
  const t = useTranslations('auth.magicLink');
  const toFormError = useFormError();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = formText(new FormData(event.currentTarget), 'identifier');
    startTransition(async () => {
      const result = await requestMagicLink({ identifier });
      setError(result.ok ? null : toFormError(result.error));
      setSent(result.ok);
    });
  };

  if (sent) {
    return (
      <div className="grid gap-4">
        <Alert>
          <CircleCheck aria-hidden />
          <AlertDescription>{t('sent')}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/login">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <FieldGroup>
        {error && <FormError error={error} />}
        <Field>
          <FieldLabel htmlFor="identifier">{t('identifier')}</FieldLabel>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t('submit')}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">{t('back')}</Link>
        </Button>
      </FieldGroup>
    </form>
  );
}

/**
 * The page an e-mailed link opens. Signing in waits for a click: mail scanners that open links to
 * check them would otherwise use the link up before its owner.
 */
export function MagicLinkSignInContainer({ token, next }: { token: string; next?: string }) {
  const t = useTranslations('auth.magicLink');
  const router = useRouter();
  const toFormError = useFormError();
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const signIn = () => {
    startTransition(async () => {
      const result = await signInWithMagicLink({ token, next });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      // `redirectTo` was reduced to a same-origin path by the server.
      router.replace(result.data.redirectTo as Parameters<typeof router.replace>[0]);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {error && <FormError error={error} />}
      <Button size="lg" className="w-full" disabled={pending} onClick={signIn} autoFocus>
        {pending && <Spinner />}
        {t('confirm')}
      </Button>
      {error && (
        <Button asChild variant="outline" className="w-full">
          <Link href="/login/link">{t('submit')}</Link>
        </Button>
      )}
    </div>
  );
}
