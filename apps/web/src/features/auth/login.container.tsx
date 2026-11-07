'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';

import { signIn } from './server/sign-in';
import { LoginForm, type Credentials } from './ui/login-form';

export function LoginContainer({ next }: { next: string | undefined }) {
  const router = useRouter();
  const toFormError = useFormError();
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (credentials: Credentials) => {
    startTransition(async () => {
      const result = await signIn({ ...credentials, next });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      // `redirectTo` was reduced to a same-origin path by the server.
      router.replace(result.data.redirectTo as Parameters<typeof router.replace>[0]);
      router.refresh();
    });
  };

  return <LoginForm pending={pending} error={error} onSubmit={handleSubmit} />;
}
